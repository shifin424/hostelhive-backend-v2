import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from 'morgan';
import superadminRouter from "./routes/superAdminRoutes.js";
import HostelAdminRouter from './routes/hostelAdminRoutes.js'
import LandingPageRouter from './routes/LandingRoutes.js'
import StudentRouter from './routes/studentRoutes.js'
import errorHandler from './middlewares/errorHandler.js';
import dbConnect from './config/dbConnection.js';
import initSocket from './config/socket.js';



const app = express();

dotenv.config();
dbConnect();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const allowedOrigins = ['http://localhost:3000',"https://hostelhive.netlify.app","https://hostelhive.site/api/"];

app.use(
  cors({
    credentials: true,
    origin: allowedOrigins

  })
);

app.use("/api/hostel", HostelAdminRouter);
app.use("/api/admin", superadminRouter);
app.use("/api/student",StudentRouter)
app.use("/api",LandingPageRouter)

//app.use(errorHandler);
const httpServer = http.createServer(app);
initSocket(httpServer, allowedOrigins);

httpServer.listen(process.env.PORT_NO, (error) => {
  if (error) {
    console.error('Error starting the server:', error);
  } else {
    console.log('Server started on port', process.env.PORT_NO);
  }
});



