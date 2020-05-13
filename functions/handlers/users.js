const { admin, db } = require("../util/admin");

const config = require("../util/config");
const firebase = require("firebase");
firebase.initializeApp(config);

const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails,
} = require("../util/validators");

exports.signup = (req, res) => {
  const newUser = {
    newEmail: req.body.newEmail,
    newPassword: req.body.newPassword,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  const { valid, errors } = validateSignupData(newUser);

  if (!valid) return res.status(400).json(errors);

  const noImg = "no-img.jpg";

  // VALIDATE DATA
  let token, userId;
  db.doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        // if handle exists, stop
        return res.status(400).json({ handle: "this handle is already taken" });
      } else {
        // create user
        return firebase
          .auth()
          .createUserWithEmailAndPassword(
            newUser.newEmail,
            newUser.newPassword
          );
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.newEmail,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId,
        followingCount: 0,
        followersCount: 0,
        headerUrl: "",
      };
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ newEmail: "Email is already in use." });
      } else if (err.code === "auth/weak-password") {
        return res
          .status(400)
          .json({ newPassword: "Password must be at least 6 characters." });
      } else {
        return res
          .status(500)
          .json({ general: "Something went wrong, please try again" });
      }
    });
};

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  const { valid, errors } = validateLoginData(user);

  if (!valid) return res.status(400).json(errors);

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      console.error(err);
      //"auth/wrong-password"
      //"auth/user-not-found"
      return res
        .status(403)
        .json({ general: "Wrong credentials, please try again" });
    });
};

// Add user details
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);

  db.doc(`/users/${req.user.handle}`)
    .update(userDetails)
    .then(() => {
      return res
        .json({ message: "Details added successfully" })
        .catch((err) => {
          console.log(err);
          return res.status(500).json({ error: err.code });
        });
    });
};

// get any user's details
exports.getUserDetails = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection("posts")
          .where("userHandle", "==", req.params.handle)
          .orderBy("createdAt", "desc")
          .get();
      }
    })
    .then((data) => {
      userData.posts = [];
      data.forEach((doc) => {
        userData.posts.push({
          body: doc.data().body,
          createdAt: doc.data().createdAt,
          userHandle: doc.data().userHandle,
          userImage: doc.data().userImage,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          postId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

// get own user details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection("likes")
          .where("userHandle", "==", req.user.handle)
          .get();
      }
    })
    .then((data) => {
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.handle)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          createdAt: doc.data().createdAt,
          postId: doc.data().postId,
          type: doc.data().type,
          read: doc.data().read,
          notificationId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.getNewestUsers = (req, res) => {
  let orderedUsers = [];
  db.collection("users")
    .orderBy("createdAt", "desc")
    .limit(4)
    .onSnapshot((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        orderedUsers.push({
          userId: doc.data().userId,
          handle: doc.data().handle,
          imageUrl: doc.data().imageUrl,
        });
      });
      return res.json(orderedUsers);
    });
};

// upload profile picture
exports.uploadImage = (req, res) => {
  const BusBoy = require("busboy");
  const path = require("path");
  const os = require("os");
  const fs = require("fs");
  const sharp = require("sharp");

  const busboy = new BusBoy({ headers: req.headers });

  let imageToBeUploaded = {};
  let imageFileName;

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    console.log(fieldname, file, filename, encoding, mimetype);
    if (mimetype !== "image/jpeg" && mimetype !== "image/jpg") {
      return res.status(400).json({ error: "Only jpg/jpeg files accepted." });
    }
    // my.image.png => ['my', 'image', 'png']
    const imageExtension = filename.split(".")[filename.split(".").length - 1];

    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    ).toString()}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });
  busboy.on("finish", () => {
    sharp(imageToBeUploaded.filepath)
      .resize(400, 400)
      .toFile(imageToBeUploaded.filepath);

    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype,
          },
        },
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: "image uploaded successfully" });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: "something went wrong" });
      });
  });
  busboy.end(req.rawBody);
};

// upload header picture
exports.uploadHeaderImage = (req, res) => {
  const BusBoy = require("busboy");
  const path = require("path");
  const os = require("os");
  const fs = require("fs");
  const sharp = require("sharp");

  const busboy = new BusBoy({ headers: req.headers });

  let imageToBeUploaded = {};
  let imageFileName;

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    console.log(fieldname, file, filename, encoding, mimetype);
    if (mimetype !== "image/jpeg" && mimetype !== "image/jpg") {
      return res.status(400).json({ error: "Only jpg/jpeg files accepted." });
    }
    // my.image.png => ['my', 'image', 'png']
    const imageExtension = filename.split(".")[filename.split(".").length - 1];

    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    ).toString()}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });
  busboy.on("finish", () => {
    sharp(imageToBeUploaded.filepath)
      .resize(500, 800)
      .toFile(imageToBeUploaded.filepath);

    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype,
          },
        },
      })
      .then(() => {
        const headerUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ headerUrl });
      })
      .then(() => {
        return res.json({ message: "header image uploaded successfully" });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: "something went wrong" });
      });
  });
  busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach((notificationId) => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: "Notifications marked read" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.followUser = (req, res) => {
  const followDoc = db
    .collection("follows")
    .where("receiverHandle", "==", req.params.handle)
    .where("senderHandle", "==", req.user.handle)
    .limit(1);

  const userDoc = db.doc(`/users/${req.params.handle}`);

  const currentUserDoc = db.doc(`/users/${req.user.handle}`);

  let userData;

  userDoc
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData = doc.data();
        userData.userId = doc.id;
        return followDoc.get();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return db
          .collection("follows")
          .add({
            receiverHandle: req.params.handle,
            senderHandle: req.user.handle,
          })
          .then(() => {
            userData.followersCount++;
            userDoc.update({ followersCount: userData.followersCount });

            return currentUserDoc.get();
          })
          .then((doc) => {
            currentUserData = doc.data();
            currentUserData.followingCount++;
            currentUserDoc.update({
              followingCount: currentUserData.followingCount,
            });
          })
          .then(() => {
            return res.status(500).json({
              userData: userData,
              currentUserData: currentUserData,
            });
          });
      } else {
        return res.status(400).json({ error: "User already followed" });
      }
    })
    .catch((err) => {
      res.status(500).json({ error: err.code });
    });
};

exports.unfollowUser = (req, res) => {
  const followDoc = db
    .collection("follows")
    .where("receiverHandle", "==", req.params.handle)
    .where("senderHandle", "==", req.user.handle)
    .limit(1);

  const userDoc = db.doc(`/users/${req.params.handle}`);

  const currentUserDoc = db.doc(`/users/${req.user.handle}`);

  let userData;

  userDoc
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData = doc.data();
        userData.userId = doc.id;
        return followDoc.get();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return res.status(400).json({ error: "User not followed" });
      } else {
        return db
          .doc(`/follows/${data.docs[0].id}`)
          .delete()
          .then(() => {
            userData.followersCount--;
            userDoc.update({ followersCount: userData.followersCount });

            return currentUserDoc.get();
          })
          .then((doc) => {
            currentUserData = doc.data();
            currentUserData.followingCount--;
            currentUserDoc.update({
              followingCount: currentUserData.followingCount,
            });
          })
          .then(() => {
            return res.status(500).json({
              userData: userData,
              currentUserData: currentUserData,
            });
          });
      }
    })
    .catch((err) => {
      res.status(500).json({ error: err.code });
    });
};

exports.getFollowers = (req, res) => {
  const followersDoc = db
    .collection("follows")
    .where("receiverHandle", "==", req.user.handle);

  followersDoc
    .get()
    .then(doc)
    .catch((err) => {
      res.status(500).json({ error: err.code });
    });
};

exports.getFollowing = (req, res) => {
  const followingDoc = db
    .collection("follows")
    .where("senderHandle", "==", req.user.handle);
};
