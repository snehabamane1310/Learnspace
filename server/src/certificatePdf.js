// Draws the certificate as a real A4 landscape PDF (no browser print dialog needed).
// Uses PDF built-in fonts, so names must use Latin letters (accents are fine).
import PDFDocument from 'pdfkit';

const clean=s=>String(s??'').normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'?');

export function streamCertificate(res,cert,verifyUrl){
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:0,
    info:{Title:`Certificate - ${clean(cert.courseTitle)}`,Author:'LearnSpace',Subject:`Certificate ${cert.certId}`}});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="LearnSpace-Certificate-${cert.certId}.pdf"`);
  doc.pipe(res);

  const W=doc.page.width,H=doc.page.height,cx=W/2;
  const gold='#b99a4a',ink='#22302a',green='#326348',muted='#6b756f',soft='#8a8568';
  const center=(t,y,o={})=>doc.text(t,0,y,{width:W,align:'center',...o});

  doc.rect(0,0,W,H).fill('#fffdf7');
  doc.lineWidth(3).strokeColor(gold).rect(24,24,W-48,H-48).stroke();
  doc.lineWidth(0.8).strokeColor(gold).rect(33,33,W-66,H-66).stroke();

  // brand
  doc.font('Helvetica-Bold').fontSize(20);
  const w1=doc.widthOfString('learnspace'),w2=doc.widthOfString('.');
  const bx=cx-(w1+w2)/2;
  doc.fillColor(ink).text('learnspace',bx,62,{lineBreak:false});
  doc.fillColor('#5d9b70').text('.',bx+w1,62,{lineBreak:false});

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#9a7b2f');
  center('CERTIFICATE OF COMPLETION',106,{characterSpacing:4});

  doc.font('Times-Italic').fontSize(15).fillColor(muted);
  center('This is to certify that',142);

  // student name, shrunk to fit
  const name=clean(cert.studentName);
  let size=48;
  doc.font('Times-Bold');
  while(size>20&&doc.fontSize(size).widthOfString(name)>W-220)size-=2;
  doc.fillColor('#1d2a23');
  center(name,166,{lineBreak:false});
  const ly=166+size*1.05+4;
  doc.lineWidth(0.8).strokeColor('#d9cfae').moveTo(cx-230,ly).lineTo(cx+230,ly).stroke();

  doc.font('Times-Italic').fontSize(15).fillColor(muted);
  center('has successfully completed the course',ly+16);

  // course title (may wrap to two lines)
  const title=clean(cert.courseTitle);
  doc.font('Times-Bold').fontSize(26).fillColor(green);
  const th=doc.heightOfString(title,{width:W-220,align:'center'});
  doc.text(title,110,ly+46,{width:W-220,align:'center'});

  // stats
  const sy=ly+46+th+16;
  const stats=[[`${cert.progress}%`,'course completed']];
  if(cert.quizPercent!=null)stats.push([`${cert.quizPercent}%`,'quiz score']);
  const gap=150,sx=cx-((stats.length-1)*gap)/2;
  stats.forEach(([n,l],i)=>{
    const x=sx+i*gap-60;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(n,x,sy,{width:120,align:'center'});
    doc.font('Helvetica').fontSize(10).fillColor(muted).text(l,x,sy+25,{width:120,align:'center'});
  });

  // footer: date | seal | instructor
  const fy=H-140;
  const date=new Date(cert.issuedAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const block=(x,value,label)=>{
    doc.lineWidth(0.8).strokeColor('#c9bf9e').moveTo(x,fy).lineTo(x+190,fy).stroke();
    doc.font('Times-Roman').fontSize(13).fillColor(ink).text(clean(value),x,fy+7,{width:190,align:'center'});
    doc.font('Helvetica').fontSize(8).fillColor(soft).text(label,x,fy+26,{width:190,align:'center',characterSpacing:1.5});
  };
  block(110,date,'DATE ISSUED');
  block(W-300,cert.instructorName||'LearnSpace team','INSTRUCTOR');

  // seal with a star
  const sy2=fy-6;
  doc.circle(cx,sy2,31).fill(gold);
  doc.lineWidth(1.2).strokeColor('#fffdf7').circle(cx,sy2,26).stroke();
  const pts=[];
  for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?7:16;pts.push([cx+r*Math.cos(a),sy2+r*Math.sin(a)])}
  doc.polygon(...pts).fill('#fffdf7');

  doc.font('Helvetica').fontSize(9).fillColor(soft);
  center(`Certificate ID: ${cert.certId}   |   Verify: ${verifyUrl}`,H-60,{characterSpacing:0.4});
  doc.end();
}
