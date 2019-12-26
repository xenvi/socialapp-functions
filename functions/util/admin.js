const admin = require("firebase-admin");
var serviceAccount = require("../adminkey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://socialapp-79173.firebaseio.com",
  storageBucket: "socialapp-79173.appspot.com"
});

const db = admin.firestore();
module.exports = { admin, db };
