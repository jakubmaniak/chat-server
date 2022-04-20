import express, { request, Request, Response } from 'express';

import handle from './helpers/handle';
import db from '../db';
import session from '../middlewares/session';
import socketMgr from '../socket-manager';


const router = express.Router();

router.get('/contacts', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const contacts = await db.contacts.findOne(
        { username },
        { projection: { _id: 0, username: 0 } }
    );

    if (contacts == null) {
        return { username, users: [], rooms: [] };
    }

    const users = await db.users.find(
        { username: { $in: contacts.users } },
        { projection: { _id: 0, password: 0 } }
    ).toArray();

    const rooms = await db.rooms.find(
        { id: { $in: contacts.rooms } },
        { projection: { _id: 0 } }
    ).toArray();

    return { ...contacts, users, rooms };
}));

router.delete('/contact/:username', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const contacts = await db.contacts.findOne({ username });

    if (contacts == null) {
        return null;
    }

    await db.contacts.updateOne(
        { username },
        { $pull: { users: req.params.username } }
    );

    await db.contacts.updateOne(
        { username: req.params.username },
        { $pull: { users: username } }
    );

    socketMgr.emitToUser(username, 'contactDeleted', { username: req.params.username });
    socketMgr.emitToUser(req.params.username, 'contactDeleted', { username });

    return null;
}));


module.exports = router;