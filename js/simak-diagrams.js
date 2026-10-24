/* Original vector diagrams. Data contains only whitelisted shapes and text, never raw SVG/HTML. */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function num(v,max) { if(typeof v!=='number'&&typeof v!=='string')return 0;v=Number(v); return Number.isFinite(v)?Math.max(0,Math.min(max,v)):0; }
  function line(x1,y1,x2,y2,extra){return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" '+(extra||'')+'/>';}
  function text(x,y,s){return '<text x="'+x+'" y="'+y+'" fill="currentColor" stroke="none" text-anchor="middle">'+esc(s)+'</text>';}
  function rect(x,y,w,h,fill){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+(fill||'none')+'"/>';}
  function poly(points,fill){return '<polygon points="'+points+'" fill="'+(fill||'none')+'"/>';}
  function dots(n,cx,cy,step){var s='';n=num(n,20);for(var i=0;i<n;i++)s+='<circle cx="'+(cx+(i%4)*step)+'" cy="'+(cy+Math.floor(i/4)*step)+'" r="3" fill="currentColor"/>';return s;}
  var shapes={
    numberCross:function(_,f){var s='';(f.values||[]).slice(0,3).forEach(function(row,i){var x=20+i*170,y=65,size=47;[[1,0],[0,1],[1,1],[2,1],[1,2]].forEach(function(cell,j){var cx=x+cell[0]*size,cy=y+cell[1]*size;s+=rect(cx,cy,size,size)+text(cx+size/2,cy+size/2+6,row[j]);});});return s;},
    symbolEquations:function(l){return text(260,80,l.a)+text(260,155,l.b)+text(260,230,l.c);},
    barChart:function(_,f){var s='',series=(f.series||[]).slice(0,2),categories=(f.categories||[]).slice(0,4),max=50;
      series.forEach(function(row){(row.values||[]).forEach(function(v){max=Math.max(max,Math.ceil(num(v,100000)/50)*50);});});
      s+=line(65,260,490,260)+line(65,260,65,55);
      for(var tick=0;tick<=3;tick++){var value=max*tick/3,y=260-190*tick/3;s+=line(60,y,490,y,'stroke-opacity=".2"')+text(35,y+6,Math.round(value*10)/10);}
      categories.forEach(function(c,i){var x=100+i*100;s+=text(x+25,285,c);series.forEach(function(row,j){var height=num(row.values[i],100000)/max*190;s+=rect(x+j*30,260-height,25,height,j?'var(--muted)':'var(--accent)');});});
      return s+text(155,27,series[0]?series[0].name:'')+rect(110,12,15,15,'var(--accent)')+text(345,27,series[1]?series[1].name:'')+rect(300,12,15,15,'var(--muted)');},
    rightTriangle:function(l){return poly('100,230 100,60 360,230')+line(100,213,117,213)+line(117,213,117,230)+text(75,145,l.a)+text(230,255,l.b)+text(245,130,l.c)+text(90,45,'A')+text(80,248,'B')+text(380,240,'C')+(l.angle?text(320,218,l.angle):'');},
    triangleAngles:function(l){return poly('80,230 400,230 190,55')+text(180,95,l.a)+text(115,217,l.b)+text(350,218,l.c);},
    exteriorAngle:function(l){return poly('75,225 335,225 180,55')+line(335,225,465,225)+text(175,95,l.a)+text(112,213,l.b)+text(365,201,l.c)+text(175,40,'A')+text(60,246,'B')+text(330,246,'C')+text(460,247,'D');},
    parallel:function(l){return line(45,80,470,80)+line(45,190,470,190)+line(115,250,340,20)+text(55,65,'p')+text(55,175,'q')+text(310,65,l.a)+text(205,175,l.b);},
    rectangleHalf:function(l){return rect(90,60,320,180)+poly('90,240 410,60 410,240','var(--accent-soft)')+line(90,240,410,60)+text(250,265,l.w)+text(60,155,l.h);},
    inscribedCircle:function(l){return rect(150,45,210,210,'var(--accent-soft)')+'<circle cx="255" cy="150" r="105" fill="var(--surface)"/>'+text(255,281,l.s);},
    sector:function(l){return '<circle cx="255" cy="155" r="105" fill="none"/>'+'<path d="M255 155 L360 155 A105 105 0 0 0 255 50 Z" fill="var(--accent-soft)"/>'+line(255,155,360,155)+line(255,155,255,50)+text(305,180,l.r)+text(280,133,l.angle);},
    cuboid:function(l){return rect(110,105,250,145)+poly('110,105 170,50 420,50 360,105')+poly('360,105 420,50 420,195 360,250')+text(235,275,l.w)+text(415,135,l.h)+text(396,235,l.d);},
    cubeDiagonal:function(l){return rect(150,95,170,170)+poly('150,95 230,60 400,60 320,95')+poly('320,95 400,60 400,230 320,265')+line(150,265,400,60,'stroke="var(--bad)" stroke-dasharray="7 4"')+text(235,290,l.s)+text(275,150,l.x);},
    coordinates:function(l){return line(55,270,465,270)+line(180,290,180,20)+line(136,248,268,72,'stroke="var(--accent)"')+'<circle cx="136" cy="248" r="4" fill="currentColor"/>'+'<circle cx="268" cy="72" r="4" fill="currentColor"/>'+line(136,248,268,248,'stroke-dasharray="5 4"')+line(268,248,268,72,'stroke-dasharray="5 4"')+text(115,229,l.p)+text(300,57,l.q)+text(475,275,'x')+text(192,18,'y');},
    similar:function(l){return poly('80,235 220,235 140,140')+poly('245,235 480,235 350,60')+line(45,140,45,235)+line(45,140,140,140,'stroke-dasharray="5 4"')+line(45,235,80,235,'stroke-dasharray="5 4"')+line(350,60,350,235,'stroke-dasharray="5 4"')+text(150,260,l.a)+text(27,190,l.b)+text(365,260,l.c)+text(330,155,l.d);},
    trapezoid:function(l){return poly('80,235 430,235 330,65 165,65')+line(165,65,165,235,'stroke-dasharray="5 4"')+text(245,48,l.a)+text(255,260,l.b)+text(135,160,l.h);},
    cylinder:function(l){return '<ellipse cx="255" cy="65" rx="110" ry="32" fill="none"/>'+line(145,65,145,235)+line(365,65,365,235)+'<path d="M145 235 A110 32 0 0 0 365 235" fill="none"/>'+'<path d="M145 235 A110 32 0 0 1 365 235" fill="none" stroke-dasharray="5 4"/>'+line(255,65,365,65)+text(310,54,l.r)+text(402,155,l.h);},
    shadedGrid:function(l){var s='',rows=num(l.rows,10),cols=num(l.cols,10),shaded=num(l.shaded,100);for(var r=0;r<rows;r++)for(var c=0;c<cols;c++)s+=rect(120+c*50,50+r*50,50,50,r*cols+c<shaded?'var(--accent-soft)':'none');return s;},
    lShape:function(l){return poly('95,65 285,65 285,145 425,145 425,255 95,255','var(--accent-soft)')+poly('285,65 425,65 425,145 285,145')+text(260,282,l.w)+text(60,165,l.h)+text(355,50,l.cw)+text(458,110,l.ch);},
    arrowSeries:function(_,f){var s='';(f.angles||[]).slice(0,4).forEach(function(a,i){var cx=55+i*102; s+=rect(cx-42,75,84,100)+ '<g transform="translate('+cx+' 125) rotate('+num(a,360)+')">'+line(0,30,0,-30)+poly('-10,-17 0,-33 10,-17','currentColor')+'</g>';});return s+rect(421,75,84,100)+text(463,138,'?');},
    dotSeries:function(){var s='';[1,2,3,4].forEach(function(rows,i){var x=15+i*103;s+=rect(x,70,92,130);for(var r=0;r<rows;r++)for(var c=0;c<=r;c++)s+='<circle cx="'+(x+46-r*7+c*14)+'" cy="'+(100+r*18)+'" r="4" fill="currentColor"/>';});return s+rect(427,70,78,130)+text(465,140,'?');},
    mirrorGrid:function(){return rect(120,35,100,100)+rect(300,35,100,100)+rect(120,165,100,100)+rect(300,165,100,100)+line(260,20,260,280,'stroke-dasharray="5 4"')+'<circle cx="140" cy="55" r="8" fill="currentColor"/>'+'<circle cx="380" cy="55" r="8" fill="currentColor"/>'+'<circle cx="140" cy="245" r="8" fill="currentColor"/>'+text(350,225,'?');},
    shapeSeries:function(){var s='';for(var i=0;i<5;i++){var cx=55+i*102;s+=rect(cx-42,70,84,120);if(i===4)s+=text(cx,138,'?');else if(i%2===0)s+='<circle cx="'+cx+'" cy="130" r="14" fill="none"/>';else s+=poly((cx-25)+',155 '+(cx+25)+',155 '+cx+',100');}return s;},
    dotMatrix:function(_,f){var s='';(f.values||[]).slice(0,3).forEach(function(row,r){row.slice(0,3).forEach(function(n,c){var x=125+c*95,y=15+r*90;s+=rect(x,y,90,85);s+=n===null?text(x+45,y+50,'?'):dots(n,x+20,y+28,14);});});return s;}
  };
  function render(f){
    if(!f||!Object.prototype.hasOwnProperty.call(shapes,f.kind))return '';
    return '<svg class="sm-diagram" viewBox="0 0 520 310" role="img" aria-label="'+esc(f.alt||'Diagram latihan')+'" xmlns="http://www.w3.org/2000/svg"><title>'+esc(f.alt||'Diagram latihan')+'</title><g stroke="currentColor" stroke-width="2" fill="none" font-family="system-ui,sans-serif" font-size="17">'+shapes[f.kind](f.labels||{},f)+'</g></svg>';
  }
  window.SIMAK_FIGURES={render:render,kinds:Object.keys(shapes)};
})();
