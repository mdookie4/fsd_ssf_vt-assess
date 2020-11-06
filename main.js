// load the libs
const express = require('express')
const handlebars = require('express-handlebars')
const mysql = require('mysql2/promise')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const morgan = require('morgan')

// configurables
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000
const API_KEY = process.env.API_KEY || "";
const NYT_URL = 'https://api.nytimes.com/svc/books/v3/reviews.json'
const LIMIT = 10
var OFFSET = 0
var copyright;

// SQL
const SQL_BOOK_LIST = 'select book_id, title from book2018 where title like ? limit ? offset ?' // order by title asc'
const SQL_BOOK_INFO = 'select * from book2018 where book_id = ?'
const SQL_COUNT_BOOK = 'select title from book2018 where title like ?'

// create an instance of the application
const app = express()

// configure handlebars
app.engine('hbs', handlebars({ defaultLayout: 'default.hbs' }))
app.set('view engine', 'hbs')

//configure morgan
app.use(morgan('combined'))

// create connection pool
const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT) || 3306,
	database: process.env.DB_NAME, //'goodreads',
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

//log all http requests
app.use(
    (req, resp, next) => {
        console.info(`${new Date()}: ${req.method} ${req.originalUrl}`)
        next()
    }
)

//Search book by letter or number
app.post('/search', express.urlencoded({extended: true}),
    async(req,resp)=> {
    //console.info(req.body) 
    const selectedButton = (req.body.selectedButton)
    //console.info(selectedButton)
    OFFSET = parseInt(req.body.offset) || 0
    //console.info("current offset: ", OFFSET)

    let conn, bookResults, bookCount;

    //start SQL process
    try {
        conn = await pool.getConnection()
        let results = await conn.query(SQL_BOOK_LIST, [`${selectedButton}%`, LIMIT, OFFSET])
        //console.info(results)
        bookResults = results[0]
        //console.info("bookresults: ", bookResults)
        let countResults = await conn.query(SQL_COUNT_BOOK, [`${selectedButton}%`])
        bookCount = countResults[0].length
        //console.info("bookCount: ", bookCount)

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
        nextOffset: OFFSET + LIMIT,
        startOfList: OFFSET <= 0,
        endOfList: OFFSET + LIMIT > bookCount
    })
})

//Get detailed info about book from database
app.get('/book/:bookId', async (req,resp)=> {
    const bookid = req.params.bookId
    let conn;
    //console.info("bookid :", bookid)

	try {
        conn = await pool.getConnection()
        const [result,_] = await conn.query(SQL_BOOK_INFO, [ `${bookid}` ])
        //console.info("json info: ", result)
        //console.info("html info: ", result[0])
        resp.status(200)
        resp.format(
            {
                'text/html': ()=>{
                    resp.render('bookdetail', { book: result[0]})//, hasBook: !!result[0].title })
                },
                'application/json': ()=> {
                    resp.json(
                        { 
                            bookId: result[0].book_id,
                            title: result[0].title,
                            authors: result[0].authors,
                            summary: result[0].description,
                            pages: result[0].pages,
                            rating: result[0].rating,
                            ratingCount: result[0].rating_count,
                            genre: result[0].genres
                        }
                    )
                },
                'default': ()=> {
                    resp.status(406)
                    resp.type('text/plain')
                    resp.send(`Not supported: ${req.get("Accept")}`)
                }
            }
        )
		
	} catch(e) {
		console.error('ERROR: ', e)
		resp.status(500)
		resp.end()
	}
})

//Get review info on book from NYTimes
app.get('/review/:title', async(req,resp)=> {

    const inTitle = req.params.title
    //console.info("pass in title: ", inTitle)

    const url = withQuery(NYT_URL, {
        title: inTitle,
        "api-key": API_KEY
    })
    
    try {
        const result = await fetch(url)
        const allData = await result.json()
        //console.info ("all Data: ", allData)
        const reviewData = allData.results[0]
        const numResult = allData.num_results
        //console.info("numResult :", numResult)
        const copyrightString = allData.copyright
        //console.info("copyright: ", copyrightString)

        resp.status(200)
        resp.type('text/html')
        resp.render('review', {
            reviewData: reviewData,
            hasReview: numResult > 0,
            copyright: copyrightString
        })
    }
    catch(e) {
        console.error('ERROR: ', e)
        resp.status(500)
        resp.send('<h2>Error</h2>' + e)
    }
})

app.get('/', (req,resp)=> {
    resp.status(200)
    resp.type('text/html')
    resp.render('index')
})

//start the app
startApp(app, pool)
