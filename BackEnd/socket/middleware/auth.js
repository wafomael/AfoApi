import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware d'authentification de la socket.
 * On valide le JWT envoyé par le client à la connexion.
 *
 * Par défaut, une connexion SANS token est REFUSÉE (la messagerie et la
 * présence reposent sur l'identité de l'utilisateur). Pour faciliter les
 * tests (Postman, etc.), on peut autoriser l'anonyme en posant la variable
 * d'environnement SOCKET_ALLOW_ANON=true → userId = null.
 *
 * @param {import('socket.io').Socket} socket
 * @param {(err?: Error) => void} next
 */
const ALLOW_ANON = process.env.SOCKET_ALLOW_ANON === 'true';

export const authenticateSocket = (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        if (ALLOW_ANON) {
            socket.userId = null; // anonyme autorisé (tests uniquement)
            return next();
        }
        return next(new Error('Authentification requise'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        return next();
    } catch (error) {
        // Token présent mais invalide : on refuse
        return next(new Error('Token invalide'));
    }
};
