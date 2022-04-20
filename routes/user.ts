import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import env from '../env';
import db from '../db';
import handle from './helpers/handle';
import socketMgr from '../socket-manager';
import session from '../middlewares/session';


const router = express.Router();

router.get('/user/state', session, handle(async (req: Request, res: Response) => {
    const user = await db.users.findOne({ username: req.session.username });

    return {
        username: user.username,
        status: user.status,
        avatar: user.avatar,
        lang: user.lang ?? 'en'
    };
}));

router.post('/user/login', handle(async (req: Request, res: Response) => {
    const user = await db.users.findOne({ username: req.body.username });

    if (!user) {
        throw new Error('USER_NOT_FOUND');
    }

    let isCorrectPassword;
    try {
        isCorrectPassword = bcrypt.compareSync(req.body.password, user.password);
    }
    catch {
        throw new Error('INVALID_PASSWORD_FORMAT');
    }

    if (!isCorrectPassword) {
        throw new Error('WRONG_PASSWORD');
    }

    const sessionId = jwt.sign(
        { username: req.body.username },
        env.jwtSecret,
        { expiresIn: '31d', algorithm: 'HS512' }
    );

    res.cookie('sid', sessionId, { maxAge: 31 * 24 * 3600 * 1000 });
    return { sessionId };
}));

router.post('/user/signup', handle(async (req: Request, res: Response) => {
    const username = req.body.username.trim();

    if (username.length < 3) {
        throw new Error('USERNAME_TOO_SHORT');
    }

    if (/^[\w .]*$/.test(username) === false) {
        throw new Error('FORBIDDEN_CHARACTERS');
    }

    if (await db.users.findOne({ username })) {
        throw new Error('USER_ALREADY_EXISTS');
    }

    if (req.body.password.length < 6) {
        throw new Error('PASSWORD_TOO_SHORT');
    }

    const availableLangs = ['de', 'en', 'pl'];

    if (!availableLangs.includes(req.body.lang)) {
        throw new Error('INVALID_LANG_CODE');
    }

    const passwordHash = bcrypt.hashSync(req.body.password, 12);

    db.users.insertOne({
        username,
        password: passwordHash,
        status: 'offline',
        avatar: null,
        lang: req.body.lang ?? 'en'
    });

    db.contacts.insertOne({
        username,
        users: [],
        rooms: []
    });

    const sessionId = jwt.sign(
        { username: req.body.username },
        env.jwtSecret,
        { expiresIn: '31d', algorithm: 'HS512' }
    );

    res.cookie('sid', sessionId, { maxAge: 31 * 24 * 3600 * 1000 });
    return { sessionId };
}));

router.post('/user/logout', session, handle(async (req: Request, res: Response) => {
    res.clearCookie('sid');
    return null;
}));

router.put('/user/status', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    await db.users.updateOne(
        { username },
        { $set: { status: req.body.status } }
    );

    socketMgr.emitToAll('userStatusChanged', { username, status: req.body.status });
}));

router.put('/user/avatar', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    await db.users.updateOne(
        { username },
        { $set: { avatar: req.body.avatarID } }
    );
}));

router.put('/user/lang', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;
    const lang = req.body.lang;

    const availableLangs = ['de', 'en', 'pl'];

    if (!availableLangs.includes(lang)) {
        throw new Error('INVALID_LANG_CODE');
    }

    await db.users.updateOne(
        { username },
        { $set: { lang } }
    );
}));

router.post('/users', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;

    const query = req.body.query.trim();

    if (query.length < 3) {
        throw new Error('QUERY_TOO_SHORT');
    }

    if (/^[\w .]*$/.test(query) === false) {
        throw new Error('FORBIDDEN_CHARACTERS');
    }

    const regex = new RegExp(query.replace(/\./g, '\\.'), 'i');

    const results = (await db.users.find(
        { username: regex },
        { projection: { _id: 0, id: 1, username: 1, avatar: 1, status: 1 } }
    ).toArray())
    .filter((user) => user.username !== username);

    return results;
}));

module.exports = router;