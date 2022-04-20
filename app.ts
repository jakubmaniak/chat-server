import http from 'http';
import socketio from 'socket.io';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import env from './env';
import db from './db';
import socketMgr from './socket-manager';
import { SessionPayload } from './middlewares/session';


const app = express();
const server = http.createServer(app);
const io = new socketio.Server(server, {
    transports: ['websocket', 'polling']
});
socketMgr.io = io;

io.on('connect', (socket) => {
    const sid = socket.handshake.query.httpsid as string;
    let username: string;

    try {
        let payload = jwt.verify(sid, env.jwtSecret, { algorithms: ['HS512'] }) as SessionPayload;
        username = payload.username;

        if (socketMgr.getSocketCountByUser(username) == 0) {
            db.users.updateOne({ username }, { $set: { status: 'online' } })
                .then(() => {
                    io.emit('userStatusChanged', { username, status: 'online' });
                });
        }

        db.contacts.findOne({ username })
            .then((entry) => {
                if (entry) socket.join(entry.rooms);
            });
    }
    catch {
        socket.disconnect(true);
        return;
    }

    socketMgr.addSocket(socket, username);

    socket.on('disconnecting', (reason) => {
        socketMgr.deleteSocket(socket);

        const socketCount = socketMgr.getSocketCountByUser(username);

        if (socketCount == 0) {
            db.users.updateOne({ username }, { $set: { status: 'offline' } })
                .then(() => {
                    io.emit('userStatusChanged', { username, status: 'offline' });
                });

        }
    });
});

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cookieParser());

app.use(require('./routes/message'));
app.use(require('./routes/user'));
app.use(require('./routes/contact'));
app.use(require('./routes/room'));
app.use(require('./routes/invitation'));


app.use((err, req, res, next) => {
    console.error(err);
    res.json({ error: true, code: err.message });
});

server.listen(3001, () => console.log('Listening...'));