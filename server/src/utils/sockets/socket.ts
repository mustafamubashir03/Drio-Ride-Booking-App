
import { Server } from "socket.io";
import { removeDriverBySocket, setDriverSocket } from "../../services/location.service";

export function initSocket(io: Server) {
    io.on('connection', (socket) => {
        console.log(`user connected: ${socket.id}`)
        //register dirver
        socket.on('registerDriver', async ({ driverId }: { driverId: string }) => {
            if (!driverId) {
                return
            }
            await setDriverSocket(driverId, socket.id)
            console.log(`Driver ${driverId} registered`)
        })
        socket.on('disconnect', async () => {
            await removeDriverBySocket(socket.id)
            console.log(`Driver disconnected`)
        })
    })

}