const blessed = require('blessed')
const fs = require('fs')

const splitAt = index => x => [x.slice(0, index), x.slice(index, index+1), x.slice(index+1)]

const text = fs.readFileSync('text.txt').toString()
const chars = [...text]
let i = 0 // cursor index
let [completedChars, cursor, incompleteChars] = splitAt(i)(text)

const screen = blessed.screen({smartCSR: true })

screen.title = 'spell'
const box = blessed.box({top: 'center', left: 'center',width: '60%',height: '60%',
    content: `{white-bg}{black-fg}${cursor}{/black-fg}{/white-bg}${incompleteChars}`,
    tags: true,
})  
screen.append(box)
box.on('keypress', function(ch, key) {

    // console.log(key.name, '+', ch, "+", chars[i])
    
    
    if ((key.name === 'space' || key.name === 'return') && (chars[i] === ' ' || chars[i] === '\n')) {
      // console.log('the space key matched!!!!')

        go()
    } else if (key.name === chars[i] || ch === chars[i]) {
      // console.log('the car key matched!!!!')

        go()

    } else {


      // const endOfWord = incompleteChars.IndexOf(' ')
  
      // let xx = [...incompleteChars]
  
      // let incompleteCharsWithHidden = []
  
  
      
      // let copy = []
      
      // xx.unshift(cursor)
      
      // let hide = true
      // xx.forEach(x => {
      //   if (x === ' ' || x === '\n') {
  
    
      console.log('the else statment matched!!!!')

        // move curser to beginning or incorrectly spelled word
        // i = text.lastIndexOf(' ', i)
        // go()
    }
    
})
screen.key(['escape', 'C-c'], (ch, key) =>  process.exit(0))
box.focus()
screen.render()
function go() {
    completedChars = splitAt(i+1)(text)[0]
    cursor = splitAt(i+1)(text)[1]
    incompleteChars = splitAt(i+1)(text)[2]
  
    const xx = cursor + incompleteChars

    const currentWord = xx.split(/[\s\n]+/)[0]

    incompleteChars = incompleteChars.substring(currentWord.length)

    for (var c in currentWord) {
      incompleteChars = ' ' + incompleteChars
    }

    box.setContent(`{green-fg}${completedChars}{/green-fg}{white-bg}{white-fg}${cursor}{/white-fg}{/white-bg}${incompleteChars}`)
    screen.render()
    i++
}