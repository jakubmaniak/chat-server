import { Collection, MongoClient } from 'mongodb';
import env from './env';

type Collections = {
    users: Collection,
    messages: Collection,
    contacts: Collection,
    rooms: Collection,
    invitations: Collection,
    joinRequests: Collection
};

let collections: Collections = {
    users: null,
    messages: null,
    contacts: null,
    rooms: null,
    invitations: null,
    joinRequests: null
};

const conn = new MongoClient(env.dbConnectionURL);
conn.connect(async (err, client) => {
    if (!err) {
        console.log('Connected to the database');
    }

    const db = client.db('chat');

    collections.users = await db.collection('users');
    collections.messages = await db.collection('messages');
    collections.contacts = await db.collection('contacts');
    collections.rooms = await db.collection('rooms');
    collections.invitations = await db.collection('invitations');
    collections.joinRequests = await db.collection('joinrequests');
});

export default collections;