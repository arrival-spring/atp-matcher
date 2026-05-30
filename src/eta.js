const { Eta } = require('eta');
const path = require('path');

const eta = new Eta({
    views: path.join(__dirname, 'templates'),
    cache: true
});

module.exports = eta;
