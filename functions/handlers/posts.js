const { db } = require("../util/admin");

// fetch all posts
exports.getAllPosts = (req, res) => {
  let posts = [];
  db.collection("posts")
    .where("location", "==", "explore")
    .orderBy("createdAt", "desc")
    .onSnapshot((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        posts.push({
          postId: doc.id,
          body: doc.data().body,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt,
          commentCount: doc.data().commentCount,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage,
        });
      });
      return res.json(posts);
    });
};

// fetch profile-specific posts
exports.getProfilePosts = (req, res) => {
  let posts = [];
  db.collection("posts")
    .where("location", "==", req.params.handle)
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      data.forEach((doc) => {
        posts.push({
          postId: doc.id,
          body: doc.data().body,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt,
          commentCount: doc.data().commentCount,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage,
        });
      });
      return db
        .collection("posts")
        .where("userHandle", "==", req.params.handle)
        .where("location", "==", "explore")
        .orderBy("createdAt", "desc")
        .get();
    })
    .then((data) => {
      data.forEach((doc) => {
        posts.push({
          postId: doc.id,
          body: doc.data().body,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt,
          commentCount: doc.data().commentCount,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage,
        });
      });
      res.json(posts);
    })
    .catch((err) => {
      res.status(500).json(err);
    });
};

// fetch home-specific posts (of users following)
exports.getHomePosts = (req, res) => {
  const followDocument = db
    .collection("follows")
    .where("senderHandle", "==", req.params.handle);

  const userDocument = db
  .collection("posts")
  .where("userHandle", "==", req.params.handle)
  .where("location", "==", "explore")
  .orderBy("createdAt", "desc")

  let posts = [];
  userDocument.get().then((data) => {
    data.forEach((doc) => {
      posts.push({
        postId: doc.id,
        body: doc.data().body,
        userHandle: doc.data().userHandle,
        createdAt: doc.data().createdAt,
        commentCount: doc.data().commentCount,
        likeCount: doc.data().likeCount,
        userImage: doc.data().userImage,
      });
    });
    return followDocument.get()
  })
    .then((data) => {
      if (data.query.size == 0) {
        throw new Error("NOT_FOUND");
      } else {
        let followDoc = [];
        data.forEach((doc) => followDoc.push(doc.data()));
        return followDoc;
      }
    })
    .then((followData) => {
      const promises = followData.map((follow) => {
        return db
          .collection("posts")
          .where("userHandle", "==", follow.receiverHandle)
          .where("location", "==", "explore")
          .get();
      });
      Promise.all(promises).then((results) => {
        results.forEach((data) => {
             data.forEach((doc) => (
               posts.push({
                postId: doc.id,
                body: doc.data().body,
                userHandle: doc.data().userHandle,
                createdAt: doc.data().createdAt,
                commentCount: doc.data().commentCount,
                likeCount: doc.data().likeCount,
                userImage: doc.data().userImage,
              })
             ));
          })
        return res.json(posts);
      });
    })
    .catch((err) => {
      if (err.message === "NOT_FOUND") {
        return res.status(400).json({ error: "Not following any users" });
      }
      res.status(500).json({ error: err.message });
    })
};

// get liked posts on profile
exports.getLikedPosts = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userHandle", "==", req.params.handle);

    let posts = [];
  likeDocument
    .get()
    .then((data) => {
      if (data.query.size == 0) {
        throw new Error("NOT_FOUND");
      } else {
      let postIds = [];
      data.forEach((doc) => {
        postIds.push({ postId: doc.data().postId });
      });
      return postIds;
      }
    })
    .then((postIds) => {
      const promises = postIds.map((post) => {
        return db.doc(`/posts/${post.postId}`).get();
      });
      Promise.all(promises).then((results) => {
        results.forEach((doc) => {
               posts.push({
                postId: doc.id,
                body: doc.data().body,
                userHandle: doc.data().userHandle,
                createdAt: doc.data().createdAt,
                commentCount: doc.data().commentCount,
                likeCount: doc.data().likeCount,
                userImage: doc.data().userImage,
              })
           })
           return res.json(posts);
       })
    })
    .catch((err) => {
      if (err.message === "NOT_FOUND") {
        return res.status(400).json({ error: "Not following any users" });
      }
      return res.status(500).json({ error: err.code });
    });
};

// create a post
exports.createAPost = (req, res) => {
  // if no post body, return error
  if (req.body.body.trim() === "") {
    return res.status(400).json({ body: "Body must not be empty" });
  }

  const newPost = {
    body: req.body.body,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
    location: req.body.location,
  };

  db.collection("posts")
    .add(newPost)
    .then((doc) => {
      const resPost = newPost;
      resPost.postId = doc.id;
      res.json(resPost);
    })
    .catch((err) => {
      res.status(500).json({ error: "something went wrong" });
      console.error(err);
    });
};

// fetch a post
exports.getPost = (req, res) => {
  let postData = {};
  db.doc(`/posts/${req.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      postData = doc.data();
      postData.postId = doc.id;
      return db
        .collection("comments")
        .orderBy("createdAt")
        .where("postId", "==", req.params.postId)
        .get();
    })
    .then((data) => {
      postData.comments = [];
      data.forEach((doc) => {
        postData.comments.push(doc.data());
      });
      return res.json(postData);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

// comment on a post
exports.commentOnPost = (req, res) => {
  if (req.body.body.trim() === "")
    return res.status(400).json({ comment: "Must not be empty" });

  const newComment = {
    body: req.body.body,
    createdAt: new Date().toISOString(),
    postId: req.params.postId,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
  };

  let postData;
  db.doc(`/posts/${req.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      
        postData = doc.data();
        postData.postId = doc.id;
        postData.commentCount++;
      return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
    })
    .then(() => {
      return db.collection("comments").add(newComment);
    })
    .then(() => {
      res.json({comment: newComment,
      post: postData});
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: "Something went wrong" });
    });
};

// like a post
exports.likePost = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userHandle", "==", req.user.handle)
    .where("postId", "==", req.params.postId)
    .limit(1);

  const postDocument = db.doc(`/posts/${req.params.postId}`);

  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        postData = doc.data();
        postData.postId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: "Post not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return db
          .collection("likes")
          .add({
            postId: req.params.postId,
            userHandle: req.user.handle,
          })
          .then(() => {
            postData.likeCount++;
            return postDocument.update({ likeCount: postData.likeCount });
          })
          .then(() => {
            return res.json(postData);
          });
      } else {
        return res.status(400).json({ error: "Post already liked" });
      }
    })
    .catch((err) => {
      res.status(500).json({ error: err.code });
    });
};

exports.unlikePost = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userHandle", "==", req.user.handle)
    .where("postId", "==", req.params.postId)
    .limit(1);

  const postDocument = db.doc(`/posts/${req.params.postId}`);

  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        postData = doc.data();
        postData.postId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: "Post not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return res.status(400).json({ error: "Post not liked" });
      } else {
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            postData.likeCount--;
            return postDocument.update({ likeCount: postData.likeCount });
          })
          .then(() => {
            res.json(postData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

// delete a post
exports.deletePost = (req, res) => {
  const document = db.doc(`/posts/${req.params.postId}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: "Unauthorized" });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      res.json({ message: "Post deleted successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
