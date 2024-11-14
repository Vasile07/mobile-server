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


wss.on('connection', (ws) => {

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        // Handle authorization message
        if (data.type === 'authorization') {
            const {token} = data.payload;
            jwt.verify(token, secretKey, (err, decoded) => {
                if (err) {
                    console.error('JWT verification failed:', err);
                    ws.send(JSON.stringify({error: 'Unauthorized'}));
                    ws.close();
                    return;
                }

                ws.userId = parseInt(decoded.userId);
                console.log('User authorized:', ws.userId);
            });
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});


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
    constructor({id, name, species, birthdate, isVaccinate, weight}) {
        this.id = id;
        this.name = name;
        this.species = species;
        this.birthdate = birthdate;
        this.isVaccinate = isVaccinate;
        this.weight = weight;
    }
}

const broadcast = (data, clientId) =>
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.userId === clientId) {
            client.send(JSON.stringify(data));
        }
    });

const router = new Router();

function formatDate(date) {
    return new Intl.DateTimeFormat('en-GB').format(new Date(date));
}

async function getAllAnimals(userId) {
    return knex('animals').select('*').where('ownerId', userId);
}

router.get('/animals', async (ctx) => {
    const token = ctx.header.authorization.split(" ").pop();
    const userId = jwt.decode(token).userId;
    const animals = await getAllAnimals(userId);
    ctx.response.body = animals;
    ctx.response.status = 200;
});

async function getAllAnimalsFromPage(userId, pageNumber, entitiesOnPage) {
    console.log("Page number: " + pageNumber);
    const offset = (pageNumber - 1) * entitiesOnPage;
    return knex('animals')
        .select('*')
        .where('ownerId', userId)
        .orderBy('id')
        .offset(offset)
        .limit(entitiesOnPage);
}

router.get("/animals/page_number=:page_number", async (ctx) => {
    const token = ctx.header.authorization.split(" ").pop();
    const userId = jwt.decode(token).userId;
    const entitiesOnPage = 8;
    const pageNumber = parseInt(ctx.params.page_number, 10);
    ctx.response.body = await getAllAnimalsFromPage(userId, pageNumber, entitiesOnPage);
    ctx.response.status = 200;
})

async function getAnimalById(animalId) {
    return knex('animals')
        .select('*')
        .where("id", animalId).first();
}


router.get('/animals/:id', async (ctx) => {
    const animalId = ctx.request.params.id;
    const animal = await getAnimalById(animalId);
    console.log(animal)
    if (animal) {
        ctx.response.body = animal;
        ctx.response.status = 200; // ok
    } else {
        ctx.response.body = {message: `item with id ${animalId} not found`};
        ctx.response.status = 404; // NOT FOUND (if you know the resource was deleted, then return 410 GONE)
    }
});

async function addAnimalToDb(animal, userId) {
    await knex('animals').insert({
        name: animal.name,
        species: animal.species,
        birthdate: animal.birthdate,
        isVaccinate: animal.isVaccinate,
        weight: animal.weight,
        ownerId: userId,
    });
}

async function getLastAnimalInserted(userId) {
    return knex('animals').select('*').where('ownerId', userId).orderBy('id', "desc").first();
}

router.post('/animals', async (ctx) => {
    const animal = ctx.request.body;
    const token = ctx.header.authorization.split(" ").pop();
    const userId = jwt.decode(token).userId;
    await addAnimalToDb(animal, userId);
    const insertedAnimal = await getLastAnimalInserted(userId);

    ctx.response.status = 200;

    broadcast({event: 'created', payload: {animal: insertedAnimal}}, userId);
});

async function updateAnimal(animal, userId, animalId) {
    try {
        // Ensure the update is performed and return the number of rows affected
        const result = await knex('animals') // Make sure to specify the table name
            .where('id', animalId)
            .update({
                name: animal.name,
                species: animal.species,
                birthdate: animal.birthdate,
                isVaccinate: animal.isVaccinate,
                weight: animal.weight,
                image: animal.image,
                ownerId: userId,
                latitude: animal.latitude,
                longitude: animal.longitude,
            });

        // Check if any rows were updated
        if (result === 0) {
            throw new Error('Animal not found or not updated');
        }

        return result; // Optionally return the result
    } catch (error) {
        console.error('Error updating animal:', error);
        throw error; // Propagate the error
    }
}


router.put("/animals/update/:id", async (ctx) => {
    const animal = ctx.request.body;
    const token = ctx.header.authorization.split(" ").pop();
    const userId = jwt.decode(token).userId;
    const animalId = ctx.params.id;
    await updateAnimal(animal, userId, animalId);
    ctx.status = 200;
})


async function getAllSpecies() {
    return knex('animals').distinct('species');
}

router.get('/species', async (ctx) => {
    try {
        const species = await getAllSpecies();
        ctx.response.body = species;
        ctx.response.status = 200;
        ctx.response.type = 'application/json'; // Optional: sets the Content-Type
    } catch (error) {
        ctx.response.status = 500;
        ctx.response.body = {message: 'An error occurred while fetching species.'};
    }
});


async function getAllAnimalsBySpecies(species, userId) {
    if (species === "undefined")
        return knex('animals').select('*').where('ownerId', userId);
    else
        return knex('animals').select('*').where('ownerId', userId).andWhere('species', species);
}

router.get('/animals/filter/species=:species', async (ctx) => {
    const token = ctx.header.authorization.split(" ").pop();
    const userId = jwt.decode(token).userId;
    const species = ctx.request.params.species;
    console.log("Start filter species " + species);
    ctx.response.body = await getAllAnimalsBySpecies(species, userId);
    ctx.response.status = 200;
});

async function getAllAnimalsSearch(userId) {
    return knex('animals')
        .select('*')
        .where('ownerId', userId);
}

router.get('/search', async (ctx) => {
    const token = ctx.header.authorization.split(" ").pop();
    const userId = jwt.decode(token).userId;
    ctx.response.body = await getAllAnimalsSearch(userId);
    ctx.response.status = 200;
})


async function findUserByEmailAndPassword(email, password) {
    const user = await knex('users').where("email", email).first();
    if (user && user.password === password) {
        return user;
    }
    return null;
}

router.post("/users/login", async (ctx) => {
    const {email, password} = ctx.request.body;

    if (!email || !password) {
        ctx.response.body = {message: "Email and password are mandatory"}
        ctx.response.status = 400; // BAD REQUEST
        return;
    }

    const user = await findUserByEmailAndPassword(email, password);

    if (user) {
        const token = jwt.sign({userId: user.id}, secretKey);
        ctx.response.body = {token: token};
        ctx.response.status = 200;
    } else {
        ctx.response.body = {message: "Bad credentials!"};
        ctx.response.status = 401; // UNAUTHORIZED
    }
});

function verifyToken(token) {
    try {
        return jwt.verify(token, secretKey);
    } catch (error) {
        // Handle specific JWT errors if needed
        throw new Error("Invalid JWT");
    }
}

function decryptToken(token) {
    return jwt.decode(token);
}

function findUserById(userId) {
    return knex('users').where("id", userId).first();
}

router.post("/users/verify", async (ctx) => {
    const {token} = ctx.request.body;

    if (!token) {
        ctx.response.body = {message: "No token received"};
        ctx.response.status = 400; // BAD REQUEST
        return;
    }

    try {
        verifyToken(token); // This will throw an error if the token is invalid
    } catch (error) {
        ctx.response.body = {message: "Invalid JWT"};
        ctx.response.status = 400; // BAD REQUEST
        return;
    }

    const {userId} = decryptToken(token);
    ctx.response.body = await findUserById(userId);
    ctx.response.status = 200;
});

/** FOR WEBSOCKET **/
// setInterval(() => {
//     const animal = new Animal({
//         id: 5,
//         name: "NEW",
//         species: "SPECIES",
//         birthdate: formatDate(Date.now()),
//         isVaccinate: true,
//         weight: 20
//     })
//     console.log("New Animal: ", animal)
//     broadcast({event: 'created', payload: {animal}},1);
// }, 5000);

app.use(router.routes());

app.use(router.allowedMethods());

server.listen(3000);