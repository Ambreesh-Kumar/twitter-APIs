const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const jwtTokenAuthorization = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload;
        next();
      }
    });
  }
};

// add User
app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const hashPassword = await bcrypt.hash(password, 10);
  const getAlreadyRegisteredUser = `
  SELECT 
    *
  FROM 
    user 
  WHERE 
    username = '${username}';
  `;
  const alreadyRegisteredUser = await db.get(getAlreadyRegisteredUser);
  if (alreadyRegisteredUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addUserQuery = `
            INSERT INTO 
                user (name,username,password,gender)
            VALUES
                (
                    '${name}',
                    '${username}',
                    '${hashPassword}',
                    '${gender}'
                )
            `;
      await db.run(addUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// user login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getAlreadyRegisteredUser = `
    SELECT 
        *
    FROM 
        user 
    WHERE 
        username = '${username}';
    `;
  const dbUser = await db.get(getAlreadyRegisteredUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMach = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMach === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// get tweets

app.get(
  "/user/tweets/feed/",
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username;
    const getFollowingUsers = `
    SELECT 
        following_user_id
    FROM
        follower 
        NATURAL JOIN user
    WHERE
        username = '${username}'
    `;
    const followingUserIds = await db.all(getFollowingUsers);
    const followingIds = followingUserIds.map(
      (object) => object.following_user_id
    );
    const getAllTweets = `
    SELECT
        username,
        tweet,
        date_time as dateTime
    FROM
        tweet
        NATURAL JOIN user 
    WHERE
        user_id IN (${followingIds})
    ORDER BY 
        date_time DESC
    LIMIT 4;
    `;
    const allTweets = await db.all(getAllTweets);
    response.send(allTweets);
  }
);

// get name of following user

app.get(
  "/user/following/",
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username;
    const getFollowingUsers = `
    SELECT *
    FROM
        follower
        NATURAL JOIN user
    WHERE
        username = '${username}';
    `;
    const followingUserIds = await db.all(getFollowingUsers);
    const userIds = followingUserIds.map((eachId) => eachId.following_user_id);
    const getFollowingUsername = `
    SELECT
        name
    FROM
        user
    WHERE
        user_id IN (${userIds});
    `;
    const followingUserNames = await db.all(getFollowingUsername);
    response.send(followingUserNames);
  }
);

// get names og the followers

app.get(
  "/user/followers/",
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username;
    const getFollowingUsers = `
    SELECT *
    FROM
        follower
        NATURAL JOIN user
    WHERE
        username = '${username}';
    `;
    const followingUserIds = await db.all(getFollowingUsers);
    const userIds = followingUserIds.map((eachId) => eachId.follower_user_id);
    const getFollowingUsername = `
    SELECT
        name
    FROM
        user
    WHERE
        user_id IN (${userIds});
    `;
    const followingUserNames = await db.all(getFollowingUsername);
    response.send(followingUserNames);
  }
);

// get tweet of specific following user

app.get(
  "/tweets/:tweetId/",
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getFollowingUsers = `
  SELECT *
  FROM
      follower
      NATURAL JOIN user
  WHERE
      username = '${username}';
  `;
    const followingUserIds = await db.all(getFollowingUsers);
    const userIds = followingUserIds.map((eachId) => eachId.following_user_id);
    if (userIds.includes(parseInt(tweetId))) {
      const getFollowingUsername = `
      SELECT
          T.tweet,
          COUNT(DISTINCT like.like_id) AS likes,
          COUNT(DISTINCT T.reply_id) AS replies,
          T.date_time AS dateTime
      FROM
          (tweet
          INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) as T
          INNER JOIN like ON T.tweet_id = like.tweet_id
      WHERE T.tweet_id = ${tweetId}
      GROUP BY 
        T.tweet_id;
      `;
      const followingUserNames = await db.get(getFollowingUsername);
      response.send(followingUserNames);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// list of username who likes the tweet

app.get(
  "/tweets/:tweetId/likes/",
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getFollowingUsers = `
  SELECT *
  FROM
      follower
      NATURAL JOIN user
  WHERE
      username = '${username}';
  `;
    const followingUserIds = await db.all(getFollowingUsers);
    const userIds = followingUserIds.map((eachId) => eachId.following_user_id);
    if (userIds.includes(parseInt(tweetId))) {
      const getLikesUsername = `
      SELECT
          T.username AS username
      FROM
          (tweet
          INNER JOIN user ON tweet.user_id = user.user_id) as T
          INNER JOIN like ON T.tweet_id = like.tweet_id
      WHERE T.tweet_id = ${tweetId}
      `;
      const likes = await db.all(getLikesUsername);
      response.send({ likes: likes.map((like) => like.username) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get list of replies

app.get(
  "/tweets/:tweetId/replies/",
  jwtTokenAuthorization,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getFollowingUsers = `
  SELECT *
  FROM
      follower
      NATURAL JOIN user
  WHERE
      username = '${username}';
  `;
    const followingUserIds = await db.all(getFollowingUsers);
    const userIds = followingUserIds.map((eachId) => eachId.following_user_id);
    if (userIds.includes(parseInt(tweetId))) {
      const getReplyANdUsernames = `
      SELECT
          username,
          reply
      FROM
          (tweet
          INNER JOIN user ON tweet.user_id = user.user_id) as T
          INNER JOIN reply ON T.tweet_id = reply.tweet_id
      WHERE T.tweet_id = ${tweetId}
      `;
      const replies = await db.all(getReplyANdUsernames);
      response.send({ replies: replies.map((eachObject) => eachObject) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// list of tweets of user

app.get("/user/tweets/", jwtTokenAuthorization, async (request, response) => {
  const username = request.username;
  const getUsersDetails = `
  SELECT user_id
  FROM
      user
  WHERE
      username = '${username}';
  `;
  const userDetail = await db.get(getUsersDetails);
  const userId = userDetail.user_id;
  const getUserTweets = `
    SELECT
      tweet.tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time  AS dateTime
    FROM
      (tweet
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
      INNER JOIN like ON T.tweet_id = like.tweet_id
    WHERE T.user_id = ${userId}
    GROUP BY T.tweet_id
    ORDER BY T.date_time ASC;
    `;
  const userTweets = await db.all(getUserTweets);
  response.send(userTweets);
});

// create a tweet

app.post("/user/tweets/", async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `
  INSERT INTO tweet(tweet)
  VALUES ('${tweet}');
  `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// delete user tweet

app.delete(
  "/tweets/:tweetId/",
  jwtTokenAuthorization,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const getUserIdQuery = `
  SELECT 
    user_id
  FROM 
    user
  WHERE
    username = '${username}';
  `;
    const userTweetDetails = await db.get(getUserIdQuery);
    const userId = userTweetDetails.user_id;
    const tweetDetailsQuery = `
    SELECT
        *
    FROM
        tweet
    WHERE
        tweet_id = ${tweetId};
    `;
    const userTweet = await db.get(tweetDetailsQuery);
    if (userTweet.user_id === userId) {
      const deleteQuery = `
        DELETE FROM
            tweet
        WHERE
            tweet_id = ${tweetId};
        `;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
