import express, { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

import handle from './helpers/handle';
import db from '../db';
import socketMgr from '../socket-manager';
import session from '../middlewares/session';


const router = express.Router();

router.post('/invitation', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;
    const { invitee, roomID } = req.body;

    const isRoomInvitation = !!roomID;
    const inviteeDoc = await db.users.findOne({ username: invitee });

    if (!inviteeDoc) {
        throw new Error('INVITEE_NOT_FOUND');
    }

    let roomDoc;
    
    if (isRoomInvitation) {
        roomDoc = await db.rooms.findOne({ id: roomID });

        if (!roomDoc) {
            throw new Error('ROOM_NOT_FOUND');
        }

        if (roomDoc.users.includes(invitee)) {
            throw new Error('INVITEE_ALREADY_ADDED');
        }

        if (!roomDoc.isEveryoneCanInvite && roomDoc.owner != username) {
            throw new Error('INVITING_PERMISSION_REQUIRED');
        }
    }
    else {
        const contacts = await db.contacts.findOne({ username });

        if (contacts?.users.includes(invitee)) {
            throw new Error('INVITEE_ALREADY_ADDED');
        }
    }

    const invitation = {
        id: uuid(),
        inviter: username,
        invitee: inviteeDoc.username,
        isRoomInvitation,
        roomID: (isRoomInvitation ? roomID : null)
    };

    await db.invitations.insertOne({ ...invitation });

    socketMgr.emitToUser(invitee, 'invitationReceived', {
        ...invitation,
        roomName: roomDoc?.name ?? null
    });

    return { id: invitation.id };
}));

router.put('/invitation', session, handle(async (req: Request, res: Response) => {
    const { username } = req.session;
    let { invitationID, action } = req.body;
    action = action.trim().toLowerCase();

    const invitation = await db.invitations.findOne({ id: invitationID });

    if (!invitation) {
        throw new Error('INVITATION_NOT_FOUND');
    }

    if (username !== invitation.invitee) {
        throw new Error('INVITED_PRIVILEGE_NEEDED');
    }

    if (action == 'reject') {
        await db.invitations.deleteOne({ id: invitationID });

        if (invitation.isRoomInvitation) {
            socketMgr.emitToUser(invitation.inviter, 'invitationRejected', invitation);
        }
    }
    else if (action == 'accept') {
        await db.invitations.deleteOne({ id: invitationID });
        
        if (invitation.isRoomInvitation) {
            const invitee = await db.users.findOne(
                { username },
                { projection: { _id: 0, password: 0 } }
            );

            const room = await db.rooms.findOne({ id: invitation.roomID });

            if (!room) {
                throw new Error('ROOM_NOT_FOUND');
            }

            await db.contacts.updateOne(
                { username },
                { $push: { rooms: invitation.roomID } }
            );
            await db.rooms.updateOne(
                { id: invitation.roomID },
                { $push: { users: username } }
            );

            socketMgr.emitToRoom(invitation.roomID, 'roomMemberJoined', {
                roomID: invitation.roomID,
                ...invitee
            });

            socketMgr.emitToUser(username, 'roomJoined', {
                id: invitation.roomID,
                name: room.name
            });
        }
        else {
            await db.contacts.updateOne(
                { username },
                { $push: { users: invitation.inviter } }
            );
            await db.contacts.updateOne(
                { username: invitation.inviter },
                { $push: { users: username } }
            );

            socketMgr.emitToUser(invitation.inviter, 'invitationAccepted', invitation);

            const inviter = await db.users.findOne(
                { username: invitation.inviter },
                { projection: { _id: 0, password: 0 } }
            );

            const invitee = await db.users.findOne(
                { username: invitation.invitee },
                { projection: { _id: 0, password: 0 } }
            );

            socketMgr.emitToUser(invitation.inviter, 'contactAdded', invitee);
            socketMgr.emitToUser(invitation.invitee, 'contactAdded', inviter);
        }
    }
    else {
        throw new Error('INVALID_ACTION');
    }

    return null;
}));

module.exports = router;