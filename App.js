const http = require('http')
require('dotenv').config()

http.createServer((req, res) => {
    let a = process.env.MY_NAME
    console.log(a)
    res.end()
}).listen(8080);