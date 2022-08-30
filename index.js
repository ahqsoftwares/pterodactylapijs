const { EventEmitter } = require("events");
const { Database } = require("quickmongo");
const { faker } = require('@faker-js/faker');
const fetch = require("node-fetch");

class API extends EventEmitter {
         /**
          * Connect to pterodactyl api
          * @param {{apikey: string, host: string, mongodbUrl: string}} APi settings
          */
          constructor(props) {
                  super();

                  const {
                           apikey,
                           host,
                           mongodbUrl
                  } = props;
                  
                  const db = new Database(mongodbUrl);

                  this.host = host;
                  this.api = apikey;
                  this.servers = {};
                  this.users = {};
                  this.db = db;

                  this.validate().catch(() => {
                           throw new Error("Invalid host or api key!");
                  })
                  .then((e) => {
                        if (e) {
                                this.loadCache()
                                .then(() => {
                                        this.emit("ready");
                                })
                                .catch(() => {
                                        throw new Error("Could not connect to service!");
                                });
                        } else {
                                throw new Error("Invalid host or api key!");
                        }
                  });
         }

         async clean(value) {
                const raw = await this.db.all();
                const key = raw.filter(({data}) => data === value);

                if (key.length === 1) {
                        await this.db.delete(key[0].ID);
                }
         }

         async loadCache() {
                const data = await this.rest("users?per_page=60000", "get", null).then((data) => data.json());
                const servers = await this.rest("servers?per_page=60000", "get", null).then((data) => data.json());
                const raw = await this.db.all();

                this.users = {};
                this.servers = {};

                await data.data.forEach(async({attributes}) => {
                        const dsc_userid = raw.filter(({ID}) => attributes.uuid === ID);
                           
                        if (dsc_userid.length === 1) {
                                this.users[dsc_userid[0].data] = attributes.id;
                        }
                });

                await servers.data.forEach(async({attributes: data}) => {
                        const dsc_userid = Object.values(this.users).filter((id) => id === data.user);
                        if (dsc_userid.length === 1) {
                                if (!this.servers[dsc_userid]) {
                                        this.servers[dsc_userid] = [];
                                }
                                this.servers[dsc_userid].push(data.id);
                        }
                });
         }

         /**
          * ⚠️Non standard method, avoid using it.
          * 
          * Send requests using rest api
          * @param {string} path 
          * @param {string} mode 
          * @param {Object} body 
          * @returns {Promise<fetch.Response | Error>} RestOutput
          */
         async rest(path, mode, body) {
                return await fetch(`${this.host}/api/application/${path}`, {
                        method: mode,
                        headers: {
                                "Accept": "application/json",
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${this.api}`
                        },
                        body: body ? JSON.stringify(body) : null
                });
         }

         /**
          * ⚠️Non standard method, avoid using it
          */
         async validate() {
                await this.db.connect();
                return await this.rest("nests", "get", null).then((e) => e.ok);
         }

        /**
         * Creates a panel user
         * @param {string} dscid 
         * @param {string} email 
         * @param {string} password 
         */
        async createUser(id, email, password) {
                await this.rest("users", "post", {
                        email,
                        username: faker.name.firstName('male').toLowerCase(),
                        "first_name": faker.name.firstName("male"),
                        "last_name": faker.name.lastName('male')
                })
                .then((data) => {
                        if (data.ok) {
                                return data.json();
                        } else {
                                throw new Error("Could not create user!");
                        }
                })
                .then(async({attributes}) => {
                        this.users[id] = attributes.id;
                        this.servers[attributes.id] = [];
                        await this.db.set(attributes.uuid, id);
                        await this.updateUser(id, attributes.email, attributes.username, password, attributes[`first_name`], attributes["last_name"])
                });
        }

        /**
         * Updates the panel user
         * @param {string} id 
         * @param {string} email 
         * @param {string} username 
         * @param {string} password 
         * @param {string} firstName 
         * @param {string} lastName 
         */
        async updateUser(id, email, username, password, firstName, lastName) {
                return await this.rest(`users/${this.users[id]}`, "patch", {
                        password,
                        email,
                        username,
                        "first_name": firstName,
                        "last_name": lastName
                })
                .then(async(status) => {
                        if (!status.ok) {
                                throw new Error("Could not update user!");
                        }
                });
        }

        /**
         * Deletes a user
         * @param {string} dsc_id 
         */
        async deleteUser(id) {
                await this.rest(`users/${this.users[id]}`, "delete", null)
                .then((status) => {
                        if (!status.ok) {
                                throw new Error("User delete failed!");
                        } else {
                                delete this.servers[this.users[id]];
                                this.clean(id);
                                delete this.users[id];
                        }
                });
        }

        /**
         * Fetches the full user info from the rest api
         * @param {string} dsc_id 
         * @returns 
         */
        async fetchUser(id) {
                return await this.rest(`users/${this.users[id]}`, "get")
                .then(async(status) => {
                        if (!status.ok) {
                                throw new Error("User fetch failed!");
                        } else {
                                return await status.json();
                        }
                });
        }

        /**
         * Get First Available Allocation
         * @param {String} nodeId 
         */
        async getAllocation(nodeId) {
                let allocations = await this.rest(`nodes/${nodeId}/allocations?per_page=1200`, "get").then((data) => data.json()).then(json => json.data);
                return allocations.find(({attributes}) => !attributes.assigned)?.attributes?.port;
        }

        /**
         * creates a server
         * @param {String} dscUser 
         * @param {Object} limits 
         * @param {String} Nodeid
         * @param {Boolean} websiteJs 
         * @returns Server data
         */
        async createServer(dscUser, limits, nodeId, location, websiteJs) {
                let allocation = await this.getAllocation(nodeId);
                return await this.rest("servers", "post", {
                        name: "Server -> Settings to set a name",
                        user: this.users[dscUser],
                        egg: websiteJs ? 16 : 15,
                        docker_image: websiteJs ? "quay.io/yajtpg/pterodactyl-images:nodejs-16" : "quay.io/yajtpg/pterodactyl-images:nodejs-18",
                        startup: "/start.sh",
                        environment: {
                                STARTUP_CMD: "npm install --save --production",
                                SECOND_CMD: "node ."
                        },
                        limits,
                        feature_limits: {
                                databases: 0,
                                backups: 0,
                                allocations: 0
                        },
                        allocation: {
                                default: allocation
                        },
                        deploy: {
                                locations: [location],
                                dedicated_ip: false,
                                port_range: [String(allocation)]
                        }
                })
                .then(async(status) => {
                        if (!status.ok) {
                                console.log(await status.json());
                                throw new Error("Failed!");
                        } else {
                                if (!this.servers[this.users[dscUser]]) {
                                        this.servers[this.users[dscUser]] = [];
                                }
                                let json = await status.json();
                                this.servers[this.users[dscUser]].push(json.attributes.id);
                                return json;
                        }
                });
        }

        /**
         * Fetches the full server data
         * @param {String} serverId 
         */
        async fetchServer(serverId) {
                return await this.rest(`servers/${serverId}`, "get")
                .then(async(data) => {
                        if (!data.ok) {
                                throw new Error("Server Fetch Failed!");
                        } else {
                                return await data.json();
                        }
                });
        }

        /**
         * Deletes a server
         * @param {String} userId 
         * @param {String} serverId
         */
        async deleteServer(userId, serverId) {
                await this.rest(`servers/${serverId}`, "delete")
                .then(async(status) => {
                        if (!status.ok) {
                                throw new Error("Server Delete Failed!");
                        } else {
                                this.servers[this.users[userId]].splice(this.servers[this.users[userId]].indexOf(serverId), 1);
                        }
                });
        }
}

module.exports = API;