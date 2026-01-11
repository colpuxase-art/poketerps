const express = require('express');
const app = express();


app.use(express.static('public'));


app.listen(3000, () => {
console.log('Serveur lancé sur http://localhost:3000');
});