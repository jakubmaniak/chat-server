import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

import handle from './helpers/handle';
import db from '../db';
import session from '../middlewares/session';
import socketMgr from '../socket-manager';
import translate from '../translate';
import { ObjectID } from 'bson';

const router = express.Router();

router.get('/messages/:recipient/attachments', session ,handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const filter = {
        $or: [
            { sender: username, recipient: req.params.recipient },
            { sender: req.params.recipient, recipient: username }
        ],
        attachment: { $exists: true }
    };

    const messages = await db.messages.find(
        filter,
        { projection: { attachment: 1 } }
    )
        .sort({ date: -1 })
        .limit(51)
        .toArray();

    const ended = (messages.length < 51);
    const attachments = messages.map((message) => message.attachment);

    return {
        ended,
        attachments: (ended ? attachments : attachments.slice(1))
    }
}));

router.get('/messages/:recipient', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const filter = {
        $or: [
            { sender: username, recipient: req.params.recipient },
            { sender: req.params.recipient, recipient: username }
        ]
    };

    //const getTotalCount = db.messages.count(filter);
    const messages = await db.messages.find(filter)
        .sort({ date: -1 })
        .limit(51)
        .toArray();

    const ended = (messages.length < 51);

    return {
        //totalCount: await getTotalCount,
        ended,
        messages: (ended ? messages : messages.slice(0, -1)).map((msg) => ({ ...msg, id: msg._id }))
    };
}));

router.get('/messages/:recipient/before/:messageID', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const filter = {
        $or: [
            { sender: username, recipient: req.params.recipient },
            { sender: req.params.recipient, recipient: username }
        ]
    };

    //const getTotalCount = db.messages.count(filter);
    const messages = await db.messages.find({
        ...filter,
        _id: { $lt: new ObjectID(req.params.messageID) }
    })
        .sort({ date: -1 })
        .limit(51)
        .toArray();

    const ended = (messages.length < 51);

    return {
        //totalCount: await getTotalCount,
        ended,
        messages: (ended ? messages : messages.slice(1)).map((msg) => ({ ...msg, id: msg._id }))
    };
}));

router.get('/messages/room/:roomID/attachments', session ,handle(async (req: Request, res: Response) => {
    const filter = {
        roomID: req.params.roomID,
        attachment: { $exists: true }
    };

    const messages = await db.messages.find(
        filter,
        { projection: { attachment: 1 } }
    )
        .sort({ date: -1 })
        .limit(51)
        .toArray();

    const ended = (messages.length < 51);
    const attachments = messages.map((message) => message.attachment);

    return {
        ended,
        attachments: (ended ? attachments : attachments.slice(1))
    }
}));

router.get('/messages/room/:roomID', session, handle(async (req: Request, res: Response) => {
    const filter = {
        roomID: req.params.roomID
    };

    //const getTotalCount = db.messages.count(filter);
    const messages = await db.messages.find(filter)
        .sort({ date: -1 })
        .limit(51)
        .toArray();

    const ended = (messages.length < 51);

    return {
        //totalCount: await getTotalCount,
        ended,
        messages: (ended ? messages : messages.slice(0, -1)).map((msg) => ({ ...msg, id: msg._id }))
    };
}));

router.post('/message', session, handle(async (req: Request, res: Response) => {
    const date = new Date();

    const { username } = req.session;
    const recipient: string = req.body.recipient;
    const roomID: string = req.body.roomID;
    const sourceLang: string = req.body.sourceLang ?? 'auto';
    const targetLang: string = req.body.targetLang;
    const fileName: string = req.body.fileName;
    
    let content: string = req.body.content?.trim();

    const message = {
        sender: username,
        date,
        content,
        recipient: null,
        roomID: null
    };

    const langs = ['cs', 'fr', 'en', 'es', 'de', 'it', 'pl', 'ru', 'sk'];

    if (content == '') {
        throw new Error('MESSAGE_TOO_SHORT');
    }
    else if (fileName) {
        (message as any).attachment = {
            type: 'image',
            extension: path.extname(fileName),
            size: fs.statSync(path.join(__dirname, '../public/attachments/', fileName)).size,
            fileName
        };
    }
    else if (content[0] == '/' && langs.includes(content.substring(1, 3)) && content[3] == ' ') {
        content = await translate(content.substring(4), 'auto', content.substring(1, 3));
    }
    else if (targetLang) {
        content = await translate(content, sourceLang, targetLang);
    }


    if (recipient) message.recipient = recipient;
    else if (roomID) message.roomID = roomID;
    message.content = content;

    const messageID = (await db.messages.insertOne(message)).insertedId;
    const emittedMessage = { ...message, id: messageID };

    if (recipient) {
        socketMgr.emitToUser(recipient, 'messageReceived', emittedMessage);

        if (recipient !== username) {
            socketMgr.emitToUser(username, 'messageReceived', emittedMessage);
        }
    }
    else if (roomID) {
        socketMgr.emitToRoom(roomID, 'messageReceived', emittedMessage);
    }

    return { id: messageID };
}));

module.exports = router;