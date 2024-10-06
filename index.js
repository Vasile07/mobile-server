const Koa = require('koa');
const app = new Koa();
const server = require('http').createServer(app.callback());
const WebSocket = require('ws');
const wss = new WebSocket.Server({server});
const Router = require('koa-router');
const cors = require('koa-cors');
const bodyparser = require('koa-bodyparser');

// For database
const Knex = require('knex');
const config = require('./knexfile');
const knex = Knex(config.development);

// For jwt
const jwt = require('jsonwebtoken');
const secretKey = '5a36e4f53d0d1f86725e7655b262054fb0fd320478c76883c60a35f2b679db5c61bacf0fe60ef539bd59a1cd7bcfacce051d9bf6926503fead7ede539ff1f17d439ee171026581cfa39633ef839914b0dbb837174b2b18a361cdf7fd5a289e088eaf5e28e5f68a314949fc43d1e4d45d75a8320a642079d711207fa1feb147b926856b2a99fe94f32aecc1666f74d5b6b4e6281d84743d3c81143e92c2014ee9f527adbde3c8c093389f2292fc834d4fd3cc12b163a616f5aad63965833e544917514e2127b25ad2ea7d29665f8c0af134f8b8652ec46a74f3380a65b99d311354192c7166783bf0677874c13e58932b7d9274416385fc6c2b504171b3422360';


app.use(bodyparser());
app.use(cors());
app.use(async (ctx, next) => {
    const start = new Date();
    await next();
    const ms = new Date() - start;
    console.log(`${ctx.method} ${ctx.url} ${ctx.response.status} - ${ms}ms`);
});

app.use(async (ctx, next) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await next();
});

app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        ctx.response.body = {message: err.message || 'Unexpected error'};
        ctx.response.status = 500;
    }
});

class Animal {
    constructor({id, name, species, birthdate, isWild, weight}) {
        this.id = id;
        this.name = name;
        this.species = species;
        this.birthdate = birthdate;
        this.isWild = isWild;
        this.weight = weight;
    }
}

const broadcast = data =>
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });

const router = new Router();

function formatDate(date) {
    return new Intl.DateTimeFormat('en-GB').format(new Date(date));
}

async function getAllAnimals() {
    return knex('animals').select('*');
}

router.get('/animals', async (ctx) => {
    const animals = await getAllAnimals();
    ctx.response.body = animals;
    ctx.response.status = 200;
});

async function getAnimalById(animalId) {
    return knex('animals')
        .select('*')
        .where("id", animalId);
}

router.get('/animals/:id', async (ctx) => {
    const animalId = ctx.request.params.id;
    const animal = getAnimalById(animalId);
    console.log(animal)
    if (animal) {
        ctx.response.body = animal;
        ctx.response.status = 200; // ok
    } else {
        ctx.response.body = {message: `item with id ${animalId} not found`};
        ctx.response.status = 404; // NOT FOUND (if you know the resource was deleted, then return 410 GONE)
    }
});


async function findUserByEmailAndPassword(email, password) {
    const user = await knex('users').where("email", email).first();
    if (user && user.password === password) {
        return user;
    }
    return null;
}

router.post("/users/login", async (ctx) => {
    const {email, password} = ctx.request.body;
    console.log(email, password);

    if (!email || !password) {
        ctx.response.body = {message: "Email and password are mandatory"}
        ctx.response.body = 400; // BAD REQUEST
        return;
    }

    const user = await findUserByEmailAndPassword(email, password);

    if (user) {
        const token = jwt.sign({userId: user.id}, secretKey, {expiresIn: "1h"});
        ctx.response.body = {token: token};
        ctx.response.status = 200;
    } else {
        ctx.response.body = {message: "Bad credentials!"};
        ctx.response.status = 401; // UNAUTHORIZED
    }
});

/** FOR WEBSOCKET **/
setInterval(() => {
    const animal = new Animal({
        id: 5,
        name: "NEW",
        species: "SPECIES",
        birthdate: formatDate(Date.now()),
        isWild: true,
        weight: 20
    })
    console.log("New Animal: ", animal)
    broadcast({event: 'created', payload: {animal}});
}, 5000);

app.use(router.routes());
app.use(router.allowedMethods());

server.listen(3000);


// const validateAnimal = (animal) => {
//     if(!animal.name || !animal.species || !animal.birthdate || !animal.isWild || !animal.weight || animal.weight > 0)
//         return false;
//     return true;
// }

// const createItem = async (ctx) => {
//     const animal = ctx.request.body;
//     if (validateAnimal(animal)) { // validation
//         ctx.response.body = { message: 'Data provided is not valid' };
//         ctx.response.status = 400; //  BAD REQUEST
//         return;
//     }
//     animal.id = `${parseInt(lastId) + 1}`;
//     lastId = item.id;
//     item.date = new Date();
//     item.version = 1;
//     items.push(item);
//     ctx.response.body = item;
//     ctx.response.status = 201; // CREATED
//     broadcast({ event: 'created', payload: { item } });
// };
//
// router.post('/item', async (ctx) => {
//     await createItem(ctx);
// });

// router.put('/item/:id', async (ctx) => {
//     const id = ctx.params.id;
//     const item = ctx.request.body;
//     item.date = new Date();
//     const itemId = item.id;
//     if (itemId && id !== item.id) {
//         ctx.response.body = { message: `Param id and body id should be the same` };
//         ctx.response.status = 400; // BAD REQUEST
//         return;
//     }
//     if (!itemId) {
//         await createItem(ctx);
//         return;
//     }
//     const index = items.findIndex(item => item.id === id);
//     if (index === -1) {
//         ctx.response.body = { message: `item with id ${id} not found` };
//         ctx.response.status = 400; // BAD REQUEST
//         return;
//     }
//     const itemVersion = parseInt(ctx.request.get('ETag')) || item.version;
//     if (itemVersion < items[index].version) {
//         ctx.response.body = { message: `Version conflict` };
//         ctx.response.status = 409; // CONFLICT
//         return;
//     }
//     item.version++;
//     items[index] = item;
//     lastUpdated = new Date();
//     ctx.response.body = item;
//     ctx.response.status = 200; // OK
//     broadcast({ event: 'updated', payload: { item } });
// });
//
// router.del('/item/:id', ctx => {
//     const id = ctx.params.id;
//     const index = items.findIndex(item => id === item.id);
//     if (index !== -1) {
//         const item = items[index];
//         items.splice(index, 1);
//         lastUpdated = new Date();
//         broadcast({ event: 'deleted', payload: { item } });
//     }
//     ctx.response.status = 204; // no content
// });


