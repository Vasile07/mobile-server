const Koa = require('koa');
const app = new Koa();
const server = require('http').createServer(app.callback());
const WebSocket = require('ws');
const wss = new WebSocket.Server({server});
const Router = require('koa-router');
const cors = require('koa-cors');
const bodyparser = require('koa-bodyparser');

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

const animals = [];
for (let i = 0; i < 3; i++) {
    animals.push(new Animal({
        id: i,
        name: `Animal ${i}`,
        species: `Species ${i % 2}`,
        birthdate: formatDate(Date.now()),
        isWild: i % 2 === 0,
        weight: i * 10
    }))
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

function getAllAnimals() {

    return animals;
}

router.get('/animals', ctx => {
    ctx.response.body = getAllAnimals();
    ctx.response.status = 200;
});

function getAnimalById(animalId) {
    return getAllAnimals().find(animal => animal.id == animalId);
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
    animals.push(animal);
    broadcast({event: 'created', payload: {animal}});
}, 5000);

app.use(router.routes());
app.use(router.allowedMethods());

server.listen(3000);
