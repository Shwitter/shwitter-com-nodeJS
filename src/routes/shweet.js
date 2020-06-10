const {check, validationResult} = require("express-validator");
const express = require('express');
const router = express.Router();
const shweetModel = require('../models/shweetModel');
const commentModel = require('../models/commentModel');
const userModel = require("../models/userModel");
const auth = require('../middleware/auth')
const eventEmitter = require('../class/eventEmitter')
const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/shweet');
    },
    filename: function (req, file, cb) {
        cb(null, new Date().toISOString() + '_' + file.originalname.replace(/ /g, '_'));
    }
})
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5
    }
})
// const Stream = new EventEmitter();


// Get all subscribed shweets.
router.get('/subscribed-shweets', auth, async (req, res) => {
    try {
        let shweets = {};
        let user = await userModel.findById(req.user.id);
        let subscribes = user.subscribes;
        // Merge shweets with it's own comments, get only subscribed shweets.
        shweets = await shweetModel.find({author: {"$in": subscribes}}, (err, shweets) => {
            console.log(shweets)
            return shweets
        }).populate('comments')
            .populate('likes', 'username')
            .populate('author', 'username');

        console.log(user.id)
        res.status(200).json(shweets)

    } catch (e) {
        console.log(e)
    }

});

// Get all shweets.
router.get('/shweets', auth, async (req, res) => {
    try {
        let shweets = {};
        // Merge shweets with it's own comments, get only subscribed shweets.
        shweets = await shweetModel.find({}, (err, shweets) => { //author: {"$ne": req.user.id}
            console.log(shweets)
            return shweets
        }).populate('comments')
            .populate('likes', 'username')
            .populate('author', 'username');

        res.status(200).json(shweets)

    } catch (e) {
        console.log(e)
    }

});

//Get single shweet.
router.get('/shweet/:id', auth, async (req, res) => {
    try {
        let shweet = await shweetModel.findById(req.params.id)
            .populate('comments')
            .populate('likes', 'username');
        if (!shweet) res.status(400).json('Shweet not found');
        res.status(200).json(shweet)

    } catch (e) {
        console.error(e);
        res.status(500).json('Server error')

    }
})

//Create Sweet.
router.post('/shweet/create', auth, async (req, res) => {
    const errors = validationResult(req);
    try {
        // Create empty comments object
        let shweetComments = new commentModel({
            comments: []
        });
        console.log(shweetComments)
        console.log(shweetComments.comments)
        shweetComments.save()

        let shweet = new shweetModel({
            body: req.body.body,
            author: req.user.id,
            created: Date.now(),
            updated: Date.now(),
            comments: shweetComments._id,
            shweetimages: req.body.shweetimage
        });

        await shweet.save();

        let user = await userModel.findById(req.user.id)
            .populate('subscribers', 'username');
        let subscribers = user.subscribers;
        //Emit shweet created event.
        eventEmitter.emit('shweet created', subscribers, shweet)
        res.status(200).json(shweet)


    } catch (e) {
        console.log(e);
        res.status(500).send('Error in Saving')
    }

})


// em.on('shweet created', () => {
//     console.log('here madafaka')
// })
// Update Shweet.
router.post('/shweet/update', auth, async (req, res) => {
    const errors = validationResult(req);

    console.log(req.body)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        });
    }

    try {

        let newData = req.body;
        let shweet = await shweetModel.findById(req.body._id);
        if (!shweet) res.status(400).json('Shweet not found');
        if (req.user.id.toString() === shweet.author.toString()) {

            shweet.body = newData.body;
            shweet.updated = Date.now();
            if (newData.shweetimage)
            shweet.shweetimages = newData.shweetimage;

            await shweet.save();
            console.log(shweet)
            let user = await userModel.findById(req.user.id)
                .populate('subscribers', 'username');
            let subscribers = user.subscribers;
            //Emit shweet created event.
            eventEmitter.emit('shweet updated', subscribers, shweet)

            res.status(200).json(shweet)
        }

    } catch (e) {
        res.status(500).json('error fetching')
        console.error(e)
    }
})

// Delete shweet
router.post('/shweet/delete/:id', auth, async (req, res) => {
    const errors = validationResult(req);

    console.log(req.body)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        });
    }

    try {
        console.log(req.params.id)
        let shweet = await shweetModel.findById(req.params.id)
        console.log(shweet)
        if (!shweet) res.status(400).json('Shweet not found');
        if (req.user.id.toString() === shweet.author.toString()) {
            // Delete post and it's own comments
            let comments = commentModel.findById(shweet.comments.toString())
            console.log(comments)
            await shweet.deleteOne()
            await comments.deleteOne()
        }
        let user = await userModel.findById(req.user.id)
            .populate('subscribers', 'username');
        let subscribers = user.subscribers;
        //Emit shweet created event.
        eventEmitter.emit('shweet deleted', subscribers, req.params.id)
        res.status(200).json('done')
    } catch (e) {
        res.status(500).json('error fetching')
        console.error(e)
    }
})

// Like shweet.
router.post('/shweet/like', auth, async (req, res) => {
    try {
        let id = req.body.shweet_id;
        let userId = req.user.id;
        let user = await userModel.findById(userId)
            .populate('subscribers', 'username');
        let subscribers = user.subscribers;

        // console.log(id)
        // console.log(user)
        let shweet = await shweetModel.findById(id)
            .populate('comments')
            .populate('author', 'username avatar');
        if (!shweet) res.status(200).json('Could not find shweet');

        let likers = shweet.likes;
        // console.log(likers)
        if (likers.includes(userId)) {
            let index = likers.indexOf(userId)
            likers.splice(index, 1)
            shweet.likes = likers;
            await shweet.save()

            res.status(200).json({shweet, action: 'unliked'})
        } else {
            likers.push(userId);
            shweet.likes = likers;
            await shweet.save()
            res.status(200).json({shweet, action: 'liked'})
        }
        //Emit shweet created event.
        eventEmitter.emit('shweet likes changed', subscribers, shweet)

    } catch (e) {
        res.status(500).json('server error')
        console.error(e)
    }

})


module.exports = router;
