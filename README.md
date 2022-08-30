This wrapper links your pterodactyl server to another database to manage concurrent data

It mapps all user to your own dsc_id (any identification id)
This simplifies the way by making a wrapper between the server and the client


Using the API
```js
const AHQJs = require("pterodactyl-api-script.js");

const petrodactyl = new AHQJs({apikey: "abcd1234", host: "https://example.com", mongodbUrl: "mongodb://example.com"});
petrodactyl.on("ready", () => {
         console.log("API Ready!");
});
```

Methods 
```js
//General
this.createUser("dsc_id", "email", "password"); //creates a user
this.fetchUser("dsc_id"); //fetched the full user info from the rest api
this.updateUser("dsc_id", "email", "username", "password", "firstName", "lastName"); //updates the user (all options are required)
this.deleteUser("dsc_id"); //deletes the user

//Advanced (not recommended to be called directly)
this.rest("path", "method", "body" || null); //get information directly from the rest api (all general functions rely on this method)
this.loadCache() //Reloads / preloads the initial cache (automatically called on startup and validation)
this.clean("dsc_id") //Cleans a user (automatically called after this.userDelete)
```