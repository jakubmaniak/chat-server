import socketio, { Socket } from 'socket.io';

export class SocketManager {
    public io: socketio.Server;
    private socketsByUsers: Map<string, Set<Socket>>;
    private userBySockets: Map<Socket, string>;
    private langBySockets: Map<Socket, string>;

    constructor() {
        this.socketsByUsers = new Map();
        this.userBySockets = new Map();

        this.langBySockets = new Map();
    }

    addSocket(socket: Socket, username: string) {
        if (this.socketsByUsers.has(username)) {
            this.socketsByUsers.get(username).add(socket);
        }
        else {
            this.socketsByUsers.set(username, new Set([socket]));
        }

        this.userBySockets.set(socket, username);
    }

    deleteSocket(socket: Socket) {
        const username = this.userBySockets.get(socket);
        const sockets = this.socketsByUsers.get(username);

        if (!sockets || sockets.size == 1) {
            this.socketsByUsers.delete(username);
        }
        else {
            sockets.delete(socket);
        }

        this.userBySockets.delete(socket);
        this.langBySockets.delete(socket);
    }

    getSocketCountByUser(username: string) {
        return this.socketsByUsers.get(username)?.size ?? 0;
    }

    getSocketsByUser(username: string) {
        return this.socketsByUsers.get(username);
    }

    getUserBySocket(socket: Socket) {
        return this.userBySockets.get(socket);
    }

    getLangBySocket(socket: Socket) {
        return this.langBySockets.get(socket);
    }

    setSocketLang(socket: Socket, lang: string) {
        this.langBySockets.set(socket, lang);
    }

    emitToAll(eventName: string, data: any) {
        this.io.emit(eventName, data);
    }

    emitToUser(username: string, eventName: string, data: any) {
        const sockets = this.getSocketsByUser(username);

        if (!sockets) {
            return;
        }

        for (let socket of sockets) {
            socket.emit(eventName, data);
        }
    }

    emitToRoom(roomID: string, eventName: string, data: any) {
        //const sockets = this.getSocketsByUser(roomID);

        // if (!sockets) {
        //     return;
        // }

        // for (let socket of sockets) {
        //     socket.emit(eventName, data);
        // }
        
        this.io.to(roomID).emit(eventName, data);
    }
}

const socketMgr = new SocketManager();

export default socketMgr;