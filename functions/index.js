const functions = require("firebase-functions");
const app = require("express")();
const FBAuth = require("./util/fbAuth");

const cors = require("cors");

var corsOptions = {
  origin: true,
  credentials: true
};

app.use(cors(corsOptions));

const { admin, db } = require("./util/admin");

const {
  getAllPosts,
  createAPost,
  getPost,
  commentOnPost,
  likePost,
  unlikePost,
  deletePost,
  getProfilePosts,
  getHomePosts,
  getLikedPosts
} = require("./handlers/posts");
const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationsRead,
  getNewestUsers,
  followUser,
  unfollowUser,
  uploadHeaderImage,
  getFollowers,
  getFollowing
} = require("./handlers/users");

// POST ROUTES //
app.get("/posts", getAllPosts);
app.get("/profilePosts/:handle", getProfilePosts);
app.get("/homePosts/:handle", getHomePosts);
app.get("/likedPosts/:handle", getLikedPosts);
app.post("/post", FBAuth, createAPost);
app.get("/posts/:postId", getPost);
app.delete("/post/:postId", FBAuth, deletePost);
app.get("/post/:postId/like", FBAuth, likePost);
app.get("/post/:postId/unlike", FBAuth, unlikePost);
app.post("/post/:postId/comment", FBAuth, commentOnPost);

// USER ROUTES //
app.post("/signup", signup);
app.post("/login", login);
app.post("/user/image", FBAuth, uploadImage);
app.post("/user/header", FBAuth, uploadHeaderImage);
app.post("/user", FBAuth, addUserDetails);
app.get("/user", FBAuth, getAuthenticatedUser);
app.get("/user/:handle", getUserDetails);
app.post("/notifications", FBAuth, markNotificationsRead);
app.get("/newusers", getNewestUsers);
app.get("/user/:handle/follow", FBAuth, followUser);
app.get("/user/:handle/unfollow", FBAuth, unfollowUser);
app.get("/user/:handle/followers", getFollowers);
app.get("/user/:handle/following", getFollowing);

exports.api = functions.region("us-central1").https.onRequest(app);

exports.deleteNotificationOnUnlike = functions
  .region("us-central1")
  .firestore.document("likes/{id}")
  .onDelete((snapshot) => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => {
        console.error(err);
        return;
      });
  });

exports.createNotificationOnLike = functions
  .region("us-central1")
  .firestore.document("likes/{id}")
  .onCreate((snapshot) => {
    // snapshot = the likes
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "like",
            read: false,
            postId: doc.id,
          });
        }
      })
      .catch((err) => {
        console.error(err);
      });
  });

exports.createNotificationOnComment = functions
  .region("us-central1")
  .firestore.document("comments/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "comment",
            read: false,
            postId: doc.id,
          });
        }
      })
      .catch((err) => {
        console.error(err);
      });
  });
  exports.createNotificationOnProfilePost = functions
  .region("us-central1")
  .firestore.document("posts/{postId}")
  .onCreate((snapshot, context) => {
    
    const postId = context.params.postId;
    console.log("Context postId data: " + postId);
    return db
      .doc(`/posts/${postId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().location &&
          snapshot.data().location !== "explore"
        ) {
          console.log("Successfully added profile post notification!");
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().location,
            sender: snapshot.data().userHandle,
            type: "post",
            read: false,
            postId: doc.id,
          });
        } else console.log("Failed to add profile post notification. Doc exists: " + doc.exists);
      })
      .catch((err) => {
        console.error(err);
      });
  });

  exports.onUserImagesChange = functions
  .region("us-central1")
  .firestore.document("/users/{userId}")
  .onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());

    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log("Image has been changed");

      const batch = db.batch();
      db
        .collection("posts")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const post = db.doc(`/posts/${doc.id}`);
            batch.update(post, { userImage: change.after.data().imageUrl });
          });
        }).then(() => {
            return db
                    .collection("comments")
                    .where("userHandle", "==", change.before.data().handle)
                    .get();
        }).then((data) => {
          data.forEach((doc) => {
            const comment = db.doc(`/comments/${doc.id}`);
            batch.update(comment, { userImage: change.after.data().imageUrl });
          });
           batch.commit();
        }).then(() => {
           return admin
            .storage()
            .bucket()
            .file(`${change.before.data().imageUrlRef}`)
            .delete()
            .then(() => {
                console.log(`Successfully deleted photo: ${change.before.data().imageUrl}`)
            }).catch(err => {
                console.error(err)
            });
        })
    } else if (change.before.data().headerUrl !== change.after.data().headerUrl && change.before.data().headerUrl !== "") {
      console.log("Header image has been changed");
          return admin
            .storage()
            .bucket()
            .file(`${change.before.data().headerUrlRef}`)
            .delete()
            .then(() => {
                console.log(`Successfully deleted header photo: ${change.before.data().headerUrl}`)
            }).catch(err => {
                console.error(err)
            });
    } else return true;
  });

exports.onPostDelete = functions
  .region("us-central1")
  .firestore.document("/posts/{postId}")
  .onDelete((snapshot, context) => {
    const postId = context.params.postId;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("postId", "==", postId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db.collection("likes").where("postId", "==", postId).get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection("notifications")
          .where("postId", "==", postId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });
