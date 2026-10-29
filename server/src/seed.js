import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {User,Course,Quiz} from './models.js';

await mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/learnspace');

const email=(process.env.ADMIN_EMAIL||'admin@example.com').toLowerCase();
let admin=await User.findOne({email});
if(!admin){
  admin=await User.create({name:process.env.ADMIN_NAME||'LearnSpace Admin',email,
    password:await bcrypt.hash(process.env.ADMIN_PASSWORD||'ChangeMe123!',12),role:'admin'});
  console.log(`Created admin ${email}`);
}else console.log(`Admin ${email} already exists; unchanged.`);

const title='Web Development Foundations';
let course=await Course.findOne({title});
if(!course){
  course=await Course.create({title,
    description:'Get comfortable with the building blocks of the web. Replace this sample course with your own lessons.',
    category:'Development',level:'Beginner',instructor:admin._id,published:true,featured:true,
    thumbnail:'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
    lessons:[{title:'Welcome to web development',description:'A first look at how websites work.',
      youtubeUrl:'https://www.youtube.com/watch?v=UB1O30fR-EE',duration:'12 min',preview:true,order:0}]});
  console.log('Created sample course');
}

if(!await Quiz.exists({course:course._id})){
  await Quiz.create({course:course._id,title:'Web basics quiz',passPercent:60,timeLimitMinutes:10,maxAttempts:3,questions:[
    {text:'Which language gives a web page its structure?',options:['HTML','CSS','SQL','Python'],correctIndex:0},
    {text:'Which language is mainly used to style a web page?',options:['HTML','CSS','Java','C'],correctIndex:1},
    {text:'Which of these runs in the browser to make pages interactive?',options:['JavaScript','MongoDB','Express','npm'],correctIndex:0}]});
  console.log('Created sample quiz');
}
const languageCourses=[
  {title:'Python Programming for Beginners',category:'Python',language:'Python',video:'rfscVS0vtbw',duration:'4 hours',questions:[
    {text:'Which keyword defines a function in Python?',options:['func','def','function','method'],correctIndex:1},
    {text:'What does len([1,2,3]) return?',options:['2','3','4','An error'],correctIndex:1},
    {text:'Which type stores key-value pairs?',options:['list','tuple','dict','set'],correctIndex:2}]},
  {title:'JavaScript Programming for Beginners',category:'JavaScript',language:'JavaScript',video:'Zi-Q0t4gMC8',duration:'3 hours',questions:[
    {text:'Which keyword declares a block-scoped variable?',options:['var','let','dim','define'],correctIndex:1},
    {text:'Which method adds an item to the end of an array?',options:['push','pop','shift','slice'],correctIndex:0},
    {text:'What does === compare?',options:['Only values','Only types','Value and type','Object keys'],correctIndex:2}]},
  {title:'C++ Programming for Beginners',category:'C++',language:'C++',video:'vLnPwxZdW4Y',duration:'4 hours',questions:[
    {text:'Which header provides std::cout?',options:['<stdio.h>','<iostream>','<string>','<math.h>'],correctIndex:1},
    {text:'Which symbol ends a C++ statement?',options:[':',',',';','.'],correctIndex:2},
    {text:'Which operator accesses a member through a pointer?',options:['.','->','::','&'],correctIndex:1}]},
  {title:'Java Programming for Beginners',category:'Java',language:'Java',video:'A74TOX803D0',duration:'4 hours',questions:[
    {text:'Which method is the usual Java program entry point?',options:['start()','main()','run()','init()'],correctIndex:1},
    {text:'Which keyword creates an object?',options:['new','make','class','this'],correctIndex:0},
    {text:'Which type stores true or false?',options:['int','String','boolean','char'],correctIndex:2}]}
];
for(const item of languageCourses){
  let languageCourse=await Course.findOne({title:item.title});
  if(!languageCourse){
    languageCourse=await Course.create({title:item.title,description:'Learn '+item.language+' fundamentals with a free video lesson, an in-course coding test and a course quiz.',category:item.category,level:'Beginner',instructor:admin._id,published:true,featured:false,thumbnail:'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',lessons:[{title:item.language+' fundamentals',description:'Core syntax and beginner programming concepts.',youtubeUrl:'https://www.youtube.com/watch?v='+item.video,duration:item.duration,preview:true,order:0}]});
    console.log('Created '+item.title);
  }
  if(!await Quiz.exists({course:languageCourse._id})){
    await Quiz.create({course:languageCourse._id,title:item.language+' fundamentals quiz',passPercent:70,timeLimitMinutes:20,maxAttempts:3,questions:item.questions});
    console.log('Created '+item.language+' quiz');
  }
}
await mongoose.disconnect();
