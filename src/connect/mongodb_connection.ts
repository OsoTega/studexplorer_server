import * as mongodb from 'mongodb';
import { database } from './db_names';

const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const url = process.env.MONGODB_URL;
//mongodb+srv://TegaOsowa:Tegaosowa11@cluster0.t6ytwjl.mongodb.net/?retryWrites=true&w=majority
var db;
const DBClient = async () => {
    if (db) {
        return db;
    }
    try {
        const client = await MongoClient.connect(url);
        db = client.db(database);
    } catch (err) {
        console.log(err);
    }
    return db;
}

export {
    DBClient,
    ObjectId
};