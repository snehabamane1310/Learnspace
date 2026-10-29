import mongoose from 'mongoose';
const {Schema}=mongoose;

/* ---------- Users ---------- */
const userSchema=new Schema({
  name:{type:String,required:true,trim:true},
  email:{type:String,required:true,unique:true,lowercase:true,trim:true},
  password:{type:String,required:true,select:false},
  role:{type:String,enum:['admin','instructor','student'],default:'student'}
},{timestamps:true});

/* ---------- Courses + lessons ---------- */
const codingChallengeSchema=new Schema({
  title:{type:String,default:'Video coding challenge',trim:true,maxlength:120},
  prompt:{type:String,default:'Write a program that reads an integer and prints its square.',trim:true,maxlength:2000},
  language:{type:String,enum:['javascript','python','c','c++','java'],default:'javascript'},
  starterCode:{type:String,default:'const fs = require("fs");\nconst n = Number(fs.readFileSync(0, "utf8").trim());\nconsole.log(n * n);',maxlength:20000},
  sampleInput:{type:String,default:'5\\n',maxlength:1000},
  sampleOutput:{type:String,default:'25',maxlength:1000},
  tests:[{input:{type:String,maxlength:1000},expected:{type:String,maxlength:1000},_id:false}]
},{_id:false});const lessonSchema=new Schema({
  codingChallenge:{type:codingChallengeSchema,default:undefined},
  title:{type:String,required:true,trim:true},
  description:{type:String,default:''},
  youtubeUrl:{type:String,required:true},
  duration:{type:String,default:''},          // free text shown to students ("12 min")
  durationSeconds:{type:Number,default:0},    // real length, detected in Studio; needed for watch tracking
  preview:{type:Boolean,default:false},
  order:{type:Number,default:0}
},{timestamps:true});

const courseSchema=new Schema({
  title:{type:String,required:true,trim:true},
  description:{type:String,required:true},
  category:{type:String,default:'General'},
  level:{type:String,enum:['Beginner','Intermediate','Advanced'],default:'Beginner'},
  instructor:{type:Schema.Types.ObjectId,ref:'User',required:true},
  published:{type:Boolean,default:false},
  featured:{type:Boolean,default:false},
  thumbnail:{type:String,default:''},
  lessons:[lessonSchema]
},{timestamps:true});

/* ---------- Enrollment + genuine-watch tracking ---------- */
const lessonProgressSchema=new Schema({
  lesson:{type:Schema.Types.ObjectId,required:true},
  ranges:{type:[new Schema({s:Number,e:Number},{_id:false})],default:[]}, // merged {s,e} second ranges that were really played
  wall:{type:Number,default:0},               // real seconds spent playing (server clock)
  lastPos:Number,
  lastBeatAt:Date,
  lastPlaying:{type:Boolean,default:false},
  completed:{type:Boolean,default:false},
  completedAt:Date
},{_id:false});

const enrollmentSchema=new Schema({
  student:{type:Schema.Types.ObjectId,ref:'User',required:true},
  course:{type:Schema.Types.ObjectId,ref:'Course',required:true},
  completedLessons:[Schema.Types.ObjectId],
  lessonProgress:[lessonProgressSchema],
  lastLesson:Schema.Types.ObjectId,
  lastPosition:{type:Number,default:0},
  passedCodeLessons:[Schema.Types.ObjectId],
  notified:{half:Date,cert:Date,done:Date}   // when the 50% / certificate / completion emails were sent
},{timestamps:true});
enrollmentSchema.index({student:1,course:1},{unique:true});

/* ---------- Quiz ---------- */
const questionSchema=new Schema({
  text:{type:String,required:true,trim:true,maxlength:500},
  options:{type:[{type:String,trim:true,maxlength:200}],validate:v=>v.length>=2&&v.length<=6},
  correctIndex:{type:Number,required:true,min:0}
});
const quizSchema=new Schema({
  course:{type:Schema.Types.ObjectId,ref:'Course',required:true,unique:true},
  title:{type:String,default:'Final quiz',trim:true,maxlength:120},
  passPercent:{type:Number,default:70,min:1,max:100},
  timeLimitMinutes:{type:Number,default:20,min:1,max:180},
  maxAttempts:{type:Number,default:3,min:0,max:20},   // 0 = unlimited
  questions:[questionSchema]
},{timestamps:true});

const attemptSchema=new Schema({
  student:{type:Schema.Types.ObjectId,ref:'User',required:true},
  course:{type:Schema.Types.ObjectId,ref:'Course',required:true},
  quiz:{type:Schema.Types.ObjectId,ref:'Quiz',required:true},
  order:[Number],                              // shuffled question order for this attempt
  status:{type:String,enum:['in_progress','submitted','terminated'],default:'in_progress'},
  endReason:{type:String,default:''},          // '', 'time', 'violations'
  violations:{type:Number,default:0},
  violationLog:[{type:{type:String},at:Date,_id:false}],
  answers:[{question:Schema.Types.ObjectId,choice:Number,_id:false}],
  score:{type:Number,default:0},
  total:{type:Number,default:0},
  percent:{type:Number,default:0},
  passed:{type:Boolean,default:false},
  expiresAt:Date,
  submittedAt:Date
},{timestamps:true});

/* ---------- Certificates ---------- */
const certificateSchema=new Schema({
  certId:{type:String,required:true,unique:true},
  student:{type:Schema.Types.ObjectId,ref:'User',required:true},
  course:{type:Schema.Types.ObjectId,ref:'Course',required:true},
  studentName:String,
  courseTitle:String,
  instructorName:String,
  progress:Number,
  quizPercent:Number,
  issuedAt:{type:Date,default:Date.now}
},{timestamps:true});
certificateSchema.index({student:1,course:1},{unique:true});

export const User=mongoose.model('User',userSchema);
export const Course=mongoose.model('Course',courseSchema);
export const Enrollment=mongoose.model('Enrollment',enrollmentSchema);
export const Quiz=mongoose.model('Quiz',quizSchema);
export const QuizAttempt=mongoose.model('QuizAttempt',attemptSchema);
export const Certificate=mongoose.model('Certificate',certificateSchema);

const codeAttemptSchema=new Schema({
  student:{type:Schema.Types.ObjectId,ref:'User',required:true},
  course:{type:Schema.Types.ObjectId,ref:'Course',required:true},
  lesson:{type:Schema.Types.ObjectId,required:true},
  status:{type:String,enum:['in_progress','submitted','terminated'],default:'in_progress'},
  score:{type:Number,default:0},total:{type:Number,default:0},passed:{type:Boolean,default:false},
  violation:{type:String,default:''},submittedAt:Date
},{timestamps:true});
export const CodeAttempt=mongoose.model('CodeAttempt',codeAttemptSchema);