// load the libs
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default

// configurables
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000
const API_KEY = process.env.API_KEY || "";
const NYT_URL = 'https://api.nytimes.com/svc/books/v3/reviews.json'
const LIMIT = 10
var OFFSET = 0

// SQL
const SQL_BOOK_LIST = 'select book_id, title from book2018 where title like ? limit ? offset ?'
const SQL_BOOK_INFO = 'select * from book2018 where book_id = ?'

// create an instance of the application
const app = express()

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

// create connection pool
const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT) || 3306,
	database: 'goodreads',
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
    connectionLimit: 4,
    timezone: '+08:00'
})

// check pool connection then start app
const startApp = async (app, pool) => {

    try {
        // acquire a connection from the connection pool
        const conn = await pool.getConnection();

        console.info('Pinging database...')
        await conn.ping()

        // release the connection
        conn.release()

        // start the server
        app.listen(PORT, () => {
            console.info(`Application started on port ${PORT} at ${new Date()}`)
        })

    } catch(e) {
        console.error('Cannot ping database: ', e)
    }
}

app.post('/search', express.urlencoded({extended: true}),
    async(req,resp)=> {
    //console.info(req.body) 
    const selectedButton = (req.body.selectedButton)
    //console.info(selectedButton)
    OFFSET = parseInt(req.body.offset) || 0
    //console.info("current offset: ", OFFSET)

    let conn, bookResults;

    //start SQL process
    try {
        conn = await pool.getConnection()
        let results = await conn.query(SQL_BOOK_LIST, [`${selectedButton}%`, LIMIT, OFFSET])
        //console.info(results)
        bookResults = results[0]
        //console.info("bookresults: ", bookResults)

    }catch(e){
        console.error("error: ",e)
        resp.status(500)
        resp.type('text/html')
        resp.send('<h2>Error in getting book results</h2>' + e)
    }
    finally{
        conn.release()
    }

    resp.status(200)
    resp.type('text/html')
    resp.render('booklist', {
        booklist: bookResults,
        letter: selectedButton,
        hasResult: bookResults.length > 0,
        prevOffset: Math.max(0, OFFSET - LIMIT),
        nextOffset: OFFSET + LIMIT
    })
})

app.get('/book/:bookId', async (req,resp)=> {
    const bookid = req.params.bookId
    let conn;
    console.info("bookid :", bookid)

	try {
        conn = await pool.getConnection()
        const [result,_] = await conn.query(SQL_BOOK_INFO, [ `${bookid}` ])
        console.info("book info: ", result)
		resp.status(200)
		resp.type('text/html')
		resp.render('bookdetail', { book: result[0]})//, hasBook: !!result[0].title })
	} catch(e) {
		console.error('ERROR: ', e)
		resp.status(500)
		resp.end()
	}
})

app.get('/review/:title', async(req,resp)=> {

    const inTitle = req.params.title
    console.info("pass in title: ", inTitle)

    const url = withQuery(NYT_URL, {
        title: inTitle,
        "api-key": API_KEY
    })
    
    const result = await fetch(url)
    const reviewData = await result.json()

    console.info("reviewData :", reviewData)

})

app.get('/', (req,resp)=> {
    resp.status(200)
    resp.type('text/html')
    resp.render('index')
})



startApp(app, pool)
