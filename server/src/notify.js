import {User,Enrollment} from './models.js';
import {mail,notifyList,realEmail} from './mailer.js';

// Called when a student enrolls: tells the course owner + admins how many learners joined, and welcomes the student.
export async function onEnrolled(course,studentId){
  try{
    const [student,owner,admins,total]=await Promise.all([
      User.findById(studentId),User.findById(course.instructor),User.find({role:'admin'},'email'),
      Enrollment.countDocuments({course:course._id})]);
    if(!student)return;
    const staff=[...new Set([owner?.email,...admins.map(a=>a.email),...notifyList()].filter(realEmail))];
    await Promise.all([
      staff.length?mail.staffEnrollment({course,student,total,to:staff}):null,
      realEmail(student.email)?mail.welcome({course,student}):null
    ]);
  }catch(e){console.error('[notify] enrollment email error:',e.message)}
}
