import express, { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

import handle from './helpers/handle';
import db from '../db';
import session from '../middlewares/session';
import socketMgr from '../socket-manager';

const router = express.Router();

router.get('/room/:roomID', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const room = await db.rooms.findOne(
        { id: req.params.roomID },
        { projection: { _id: 0 } }
    );

    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (!room.users.includes(username)) throw new Error('ROOM_MEMBERSHIP_REQUIRED');

    room.users = await db.users.find(
        { username: { $in: room.users } },
        { projection: { _id: 0, password: 0 } }
    ).toArray();

    return room;
}));

router.delete('/room/:roomID', session, handle(async (req: Request, res: Response) => {
    const roomID = req.params.roomID;
console.log(req.params);
    console.log({roomID});

    const room = await db.rooms.findOne(
        { id: roomID },
        { projection: { _id: 0 } }
    );

    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.owner !== req.session.username) throw new Error('ROOM_OWNERSHIP_REQUIRED');

    await db.rooms.deleteOne({ id: roomID });
    await (db.contacts as any).updateMany(
        { rooms: roomID },
        { $pull: { rooms: roomID } }
    );

    socketMgr.emitToRoom(roomID, 'roomLeft', { id: roomID });

    return room;
}));

router.get('/room/last', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    return await db.messages.findOne(
        {
            $or: [
                { sender: username },
                { recipient: username }
            ]
        },
        {
            sort: { date: -1 },
            projection: { _id: 0 }
        }
    );

    // return await db.messages.find({
    //     $or: [
    //         { sender: username, recipient: req.params.recipient },
    //         { sender: req.params.recipient, recipient: username }
    //     ]
    // })
    //     .sort({ date: -1 })
    //     .limit(1)
    //     .project({ _id: 0 })
    //     .toArray()[0];
}));

router.post('/room', session, handle(async (req: Request, res: Response) => {
    const username = req.session.username;
    const id = uuid();

    await db.rooms.insertOne({
        id,
        owner: username,
        name: req.body.name,
        users: [username],
        isEveryoneCanInvite: false
    });

    // const entry = await db.contacts.findOne({ username });

    // if (!entry) {
    //     await db.contacts.insertOne({
    //         username,
    //         users: [],
    //         rooms: []
    //     });
    // }
    // else {
    //     await db.contacts.updateOne(
    //         { username },
    //         { $push: { rooms: id } }
    //     );
    // }

    await db.contacts.updateOne(
        { username },
        {
            $setOnInsert: { users: [] },
            $push: { rooms: id }
        },
        { upsert: true }
    );

    for (const socket of socketMgr.getSocketsByUser(username)) {
        socket.join(id);
    }

    return { id };
}));

router.put('/room', session, handle(async (req: Request, res: Response) => {
    const username = req.session.username;
    let { roomID, property, value } = req.body;

    property = property.trim();

    if (!['name', 'isEveryoneCanInvite'].includes(property)) {
        throw new Error('INVALID_PROPERTY');
    }

    if (property === 'name') {
        if (/^[\w .]*$/.test(value.trim()) === false) {
            throw new Error('FORBIDDEN_CHARACTERS');
        }
    }

    const room = await db.rooms.findOne({ id: roomID });

    if (!room) {
        throw new Error('ROOM_NOT_FOUND');
    }

    if (room.owner !== username) {
        throw new Error('ROOM_OWNERSHIP_REQUIRED');
    }

    await db.rooms.updateOne(
        { id: roomID },
        { $set: { [property]: value } }
    );

    return null;
}));

router.post('/room/joinrequest', session, handle(async (req: Request, res: Response) => {
    const username = req.session.username;
    const { roomID } = req.body;

    const room = await db.rooms.findOne({ id: roomID });

    if (!room) {
        throw new Error('ROOM_NOT_FOUND');
    }

    if (room.users.includes(username)) {
        throw new Error('ALREADY_JOINED');
    }

    const id = uuid();

    await db.joinRequests.insertOne({
        id,
        requester: username,
        roomID
    });

    socketMgr.emitToUser(room.owner, 'joinRequestReceived', {
        id,
        requester: username,
        roomID,
        roomName: room.name
    });

    return null;
}));

router.put('/room/joinrequest', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;
    let { joinRequestID, action } = req.body;
    action = action.trim().toLowerCase();

    const joinRequest = await db.joinRequests.findOne({ id: joinRequestID });

    if (!joinRequest) {
        throw new Error('JOIN_REQUEST_NOT_FOUND');
    }

    const requester = await db.users.findOne(
        { username: joinRequest.requester },
        { projection: { _id: 0, password: 0 } }
    );

    if (!requester) {
        throw new Error('REQUESTER_ACCOUNT_NOT_FOUND');
    }

    const room = await db.rooms.findOne({ id: joinRequest.roomID });

    if (!room) {
        throw new Error('ROOM_NOT_FOUND');
    }

    if (username !== room.owner) {
        throw new Error('ROOM_OWNERSHIP_NEEDED');
    }

    await db.rooms.updateOne(
        { id: room.id },
        { $addToSet: { users: requester.username } }
    );
    await db.contacts.updateOne(
        { username: requester.username },
        { $addToSet: { rooms: room.id } }
    );
    await db.joinRequests.deleteOne({ id: joinRequestID });

    socketMgr.emitToRoom(room.id, 'roomMemberJoined', {
        roomID: room.id,
        ...requester
    });

    socketMgr.emitToUser(requester.username, 'roomJoined', {
        id: room.id,
        name: room.name
    });

    return null;
}));

router.post('/room/leave', session, handle(async (req: Request, res: Response) => {
    const username = req.session.username;

    const room = (await (db.rooms as any).findOneAndUpdate(
        { id: req.body.roomID },
        { $pull: { users: username } }
    )).value;

    if (!room) {
        throw new Error('ROOM_NOT_FOUND');
    }

    if (room.users.length <= 1) {
        db.rooms.deleteOne({ id: req.body.roomID });
    }

    await db.contacts.updateOne(
        { username },
        { $pull: { rooms: room.id }}
    );
    
    socketMgr.emitToUser(username, 'roomLeft', { id: room.id });

    socketMgr.emitToRoom(room.id, 'roomMemberLeft', {
        roomID: room.id,
        username
    });

    return null;
}));

router.post('/rooms', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const query = req.body.query.trim();

    if (query.length < 3) {
        throw new Error('QUERY_TOO_SHORT');
    }

    if (/^[\w .]*$/.test(query) === false) {
        throw new Error('FORBIDDEN_CHARACTERS');
    }

    const regex = new RegExp(query.replace(/\./g, '\\.'), 'i');

    const results = (await db.rooms.find(
        { name: regex },
        { projection: { _id: 0, id: 1, name: 1, owner: 1 } }
    ).toArray())
    .filter((user) => user.username !== username);

    return results;
}));

module.exports = router;