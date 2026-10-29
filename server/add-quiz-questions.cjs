// Adds ready-made HTML / CSS / JavaScript questions to your course quiz.
// Run from the server folder:
//   node add-quiz-questions.cjs                      -> adds all 36 new questions
//   node add-quiz-questions.cjs 15                   -> adds 15 random new ones
//   node add-quiz-questions.cjs 15 "My Course Title" -> use another course
// Existing questions are kept. Questions already in the quiz are not added twice.
require('dotenv').config();
const mongoose=require('mongoose');

// [question, CORRECT answer, wrong, wrong, wrong]  (answer positions are shuffled automatically)
const BANK=[
 // ---------- HTML ----------
 ['What does HTML stand for?','HyperText Markup Language','Hyperlinks and Text Markup Language','High Tech Modern Language','Home Tool Markup Language'],
 ['Which tag creates the largest heading?','<h1>','<h6>','<head>','<heading>'],
 ['Which tag creates a hyperlink?','<a>','<link>','<href>','<url>'],
 ['Which attribute holds the destination address of a link?','href','src','alt','target-url'],
 ['Which tag displays an image on a page?','<img>','<picture-src>','<image>','<photo>'],
 ['Which attribute gives alternative text for an image?','alt','title','caption','name'],
 ['Which tag creates a bulleted (unordered) list?','<ul>','<ol>','<li>','<list>'],
 ['Which tag defines a row in a table?','<tr>','<td>','<th>','<row>'],
 ['Which element is used to create form fields such as text boxes?','<input>','<field>','<box>','<data>'],
 ['Where does the visible content of a web page go?','Inside <body>','Inside <head>','Inside <title>','Inside <meta>'],
 ['Which line tells the browser that the document is HTML5?','<!DOCTYPE html>','<html5>','<?html version=5?>','<doctype=html5>'],
 ['Which tag marks text as important (usually shown bold)?','<strong>','<heavy>','<big>','<bold-text>'],
 // ---------- CSS ----------
 ['What does CSS stand for?','Cascading Style Sheets','Creative Style Sheets','Computer Style Sheets','Colorful Style Syntax'],
 ['Which property changes the colour of text?','color','text-color','font-color','foreground'],
 ['Which symbol selects elements by class name?','. (dot)','# (hash)','* (star)','@ (at)'],
 ['Which symbol selects an element by its id?','# (hash)','. (dot)','& (and)','$ (dollar)'],
 ['In the CSS box model, which order is correct from the inside out?','content, padding, border, margin','content, margin, border, padding','margin, border, padding, content','padding, content, margin, border'],
 ['Which declaration turns on flexbox layout?','display: flex;','position: flex;','layout: flex;','flex: on;'],
 ['Which property adds space INSIDE an element, between content and border?','padding','margin','spacing','gap-inner'],
 ['Which property adds space OUTSIDE an element\'s border?','margin','padding','outline','border-space'],
 ['Which CSS feature lets a layout adapt to different screen sizes?','Media queries','Selectors','Pseudo-elements','Comments'],
 ['Which property sets the size of text?','font-size','text-size','font-style','text-scale'],
 ['How do you link an external CSS file in HTML?','<link rel="stylesheet" href="style.css">','<style src="style.css">','<css href="style.css">','<script href="style.css">'],
 ['Which property defines the columns of a CSS grid?','grid-template-columns','grid-columns','column-layout','grid-cols'],
 // ---------- JavaScript ----------
 ['Which keyword declares a variable that cannot be reassigned?','const','let','var','static'],
 ['Which operator compares both value and type?','===','==','=','!='],
 ['How do you write a single-line comment in JavaScript?','// comment','<!-- comment -->','# comment','** comment'],
 ['Which statement prints a message to the browser console?','console.log("Hi")','print("Hi")','echo("Hi")','System.out.println("Hi")'],
 ['Which is the correct way to create a function?','function greet() {}','create greet() {}','def greet() {}','func greet() {}'],
 ['What data type is the value "hello"?','String','Number','Boolean','Array'],
 ['Which array method adds an item to the END of an array?','push()','pop()','shift()','append-end()'],
 ['What does typeof 42 return?','"number"','"integer"','"digit"','"numeric"'],
 ['Which method selects an element by its id?','document.getElementById()','document.getId()','document.selectId()','window.findElement()'],
 ['Which event happens when a user clicks a button?','click','press','hover','change'],
 ['What is the result of 2 + "2" in JavaScript?','"22"','4','NaN','undefined'],
 ['Which loop is best when you know how many times to repeat?','for loop','if statement','switch statement','try...catch'],
];

const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

(async()=>{
  const {Course,Quiz}=await import('./src/models.js');
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
  const want=process.argv[3]||'Web Development Foundations';
  const course=await Course.findOne({title:want});
  if(!course){
    const all=await Course.find({},'title');
    console.log(`Course "${want}" not found. Your courses:`);
    all.forEach(c=>console.log('  -',c.title));
    console.log('\nRun again with the title, for example:\n  node add-quiz-questions.cjs 36 "'+(all[0]?.title||'Course title')+'"');
    process.exit(1);
  }
  const quiz=(await Quiz.findOne({course:course._id}))||new Quiz({course:course._id,title:'Final quiz',passPercent:70,timeLimitMinutes:20,maxAttempts:3});
  const have=new Set(quiz.questions.map(q=>q.text.trim().toLowerCase()));
  let fresh=shuffle(BANK.filter(b=>!have.has(b[0].toLowerCase())));
  const n=parseInt(process.argv[2],10);
  if(n>0)fresh=fresh.slice(0,n);
  if(!fresh.length){console.log('All of these questions are already in the quiz. Nothing to add.');process.exit(0)}
  for(const [text,right,...wrong] of fresh){
    const options=shuffle([right,...wrong]);
    quiz.questions.push({text,options,correctIndex:options.indexOf(right)});
  }
  await quiz.save();
  const total=quiz.questions.length;
  console.log(`Added ${fresh.length} questions to "${course.title}". The quiz now has ${total} questions.`);
  console.log(`Time limit is ${quiz.timeLimitMinutes} min and pass mark ${quiz.passPercent}%.`);
  console.log(`Tip: for ${total} questions, set the time limit to about ${Math.ceil(total*0.75)} minutes in Studio -> Final quiz -> Edit quiz.`);
  process.exit(0);
})().catch(e=>{console.log('ERROR:',e.message);process.exit(1)});
