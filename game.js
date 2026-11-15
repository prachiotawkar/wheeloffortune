/* Fortune Wheel. No dependencies, no network calls. */
(() => {
  'use strict';

  const STORAGE_KEY = 'fortune-wheel-save-v1';
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const VOWELS = new Set('AEIOU'.split(''));
  const AUTO_BONUS = 'RSTLNE'.split('');
  const PLAYER_COLORS = ['#ffbf67', '#f77bbd', '#73cdff', '#8af1cf'];
  const TWO_PI = Math.PI * 2;
  const TURN_SECONDS = 15;
  const BONUS_SECONDS = 30;
  const SEGMENTS = [
    { label: '100', kind: 'cash', points: 100, c: ['#e95c9f', '#ca287c'] },
    { label: '500', kind: 'cash', points: 500, c: ['#2db5f6', '#2275cb'] },
    { label: 'BANKRUPT', kind: 'bankrupt', c: ['#313046', '#0d0c19'] },
    { label: '300', kind: 'cash', points: 300, c: ['#f9c755', '#eb8734'] },
    { label: '700', kind: 'cash', points: 700, c: ['#954cec', '#6527bf'] },
    { label: 'FREE SPIN', kind: 'free', c: ['#39d7a7', '#1aa58b'] },
    { label: '200', kind: 'cash', points: 200, c: ['#f56c9a', '#e03667'] },
    { label: '1000', kind: 'cash', points: 1000, c: ['#f3a745', '#dd5a35'] },
    { label: 'LOSE A TURN', kind: 'lose', c: ['#4a4772', '#231d43'] },
    { label: '600', kind: 'cash', points: 600, c: ['#38a6e6', '#2676c1'] },
    { label: '1500', kind: 'cash', points: 1500, c: ['#d45dea', '#9b36bf'] },
    { label: 'MYSTERY PRIZE', kind: 'mystery', c: ['#d7ab4b', '#a85ca2'] },
    { label: '400', kind: 'cash', points: 400, c: ['#65bd52', '#298b70'] },
    { label: '800', kind: 'cash', points: 800, c: ['#ed6466', '#cb3866'] }
  ];

  const $ = id => document.getElementById(id);
  const els = {
    canvas: $('wheelCanvas'), confetti: $('confettiCanvas'), score: $('scoreBoard'),
    board: $('puzzleBoard'), keyboard: $('letterGrid'), category: $('categoryTitle'),
    announcement: $('gameAnnouncement'), banner: $('bannerMessage'), timer: $('timerValue'),
    timerBox: $('timerBox'), round: $('roundIndicator'), active: $('turnName'), prompt: $('turnPrompt'),
    selected: $('selectedLetter'), letterNote: $('letterNote'), spinResult: $('landedCard'),
    spin: $('spinButton'), guess: $('guessButton'), vowel: $('vowelButton'), solve: $('solveButton'),
    solveArea: $('solveArea'), solveInput: $('solveInput'), submitSolve: $('submitSolveButton'),
    cancelSolve: $('cancelSolveButton'), hint: $('hintButton'), hintText: $('hintText'),
    progress: $('progressFill'), progressText: $('progressText'), freeSpin: $('freeSpinNote'),
    track: $('roundTrack'), next: $('nextRoundButton'), sound: $('soundButton'),
    newGame: $('newGameButton'), modal: $('modalBackdrop'), modalKicker: $('modalKicker'),
    modalTitle: $('modalTitle'), modalDescription: $('modalDescription'),
    modalContent: $('modalContent'), modalActions: $('modalActions'), modalEmblem: $('modalEmblem'),
    pointer: $('wheelPointer')
  };

  const newState = () => ({
    version: 1, status: 'setup', players: [], active: 0, round: 1,
    difficulty: 'easy', categoryFilter: 'all', selectedPuzzles: [],
    revealed: [], used: [], phase: 'spin', spinValue: 0, mysteryValue: 0,
    lastSegment: null, wheelRotation: 0, deadline: null, bonusPicks: [], bonusPlayer: 0,
    bonusPrize: 0, bonusWon: false, message: 'Let the games begin!', hintShown: false
  });
  let state = load() || newState();
  let selection = null;
  let solveOpen = false;
  let spinning = false;
  let audioContext = null;
  let soundEnabled = true;
  let knownReveals = new Set();
  let tickLast = 0;
  let confettiFrame = null;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.version !== 1 || !Array.isArray(saved.players) || !Array.isArray(saved.selectedPuzzles)) return null;
      if (!['setup','playing','roundComplete','bonusPick','bonusPlay','finished'].includes(saved.status)) return null;
      if (saved.status !== 'setup' && saved.selectedPuzzles.length !== 6) return null;
      return { ...newState(), ...saved };
    } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage optional */ }
  }
  function randInt(n) {
    if (globalThis.crypto && crypto.getRandomValues) {
      const bucket = new Uint32Array(1);
      const range = 2 ** 32;
      const limit = range - (range % n);
      do { crypto.getRandomValues(bucket); } while (bucket[0] >= limit);
      return bucket[0] % n;
    }
    return Math.floor(Math.random() * n);
  }
  const cash = n => Number(n || 0).toLocaleString('en-IN');
  const isVowel = c => VOWELS.has(c);
  const norm = value => String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  const activePlayer = () => state.players[state.active];
  const puzzle = () => state.selectedPuzzles[Math.min(state.round - 1, 5)];
  const totalLetters = p => (p?.answer.match(/[A-Z]/g) || []).length;
  const allRevealed = () => [...puzzle().answer].every(c => !/[A-Z]/.test(c) || state.revealed.includes(c));
  const isActive = () => state.status === 'playing';
  const bonusRevealed = () => [...AUTO_BONUS, ...state.bonusPicks];
  const currentReveal = () => state.status.startsWith('bonus') ? bonusRevealed() : state.revealed;
  const countsInPuzzle = letter => [...puzzle().answer].filter(c => c === letter).length;

  function playTone(frequency, duration = .12, type = 'sine', volume = .065, delay = 0, destination = null) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const start = audioContext.currentTime + delay;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume), start + .012);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      osc.connect(gain).connect(destination || audioContext.destination);
      osc.start(start); osc.stop(start + duration + .02);
    } catch { /* AudioContext may be unavailable */ }
  }
  function sound(name) {
    switch(name) {
      case 'tick': playTone(850, .036, 'triangle', .018); break;
      case 'stop': [392,523,784].forEach((n,i)=>playTone(n,.24,'sine',.085,i*.075)); break;
      case 'correct': [660,880,1175].forEach((n,i)=>playTone(n,.15,'sine',.063,i*.085)); break;
      case 'wrong': playTone(210,.28,'sawtooth',.045); playTone(155,.29,'sawtooth',.029,.13); break;
      case 'bankrupt': [392,294,196,131].forEach((n,i)=>playTone(n,.28,'triangle',.075,i*.17)); break;
      case 'win': [523,659,784,1047,1319].forEach((n,i)=>playTone(n,.36,'sine',.07,i*.16)); break;
      case 'bonus': [784,988,1175].forEach((n,i)=>playTone(n,.2,'sine',.07,i*.09)); break;
    }
  }

  function setupCanvas(canvas, logicalSize) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = logicalSize * dpr;
    canvas.height = logicalSize * dpr;
    const context = canvas.getContext('2d');
    context.setTransform(dpr,0,0,dpr,0,0);
    return context;
  }
  const wctx = setupCanvas(els.canvas, 840);
  function wheelIndex(angle = state.wheelRotation) {
    const a = ((-angle % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.floor(a / (TWO_PI / SEGMENTS.length)) % SEGMENTS.length;
  }
  function drawWheel(rotation = state.wheelRotation) {
    const ctx = wctx;
    ctx.clearRect(0,0,840,840);
    ctx.save();
    ctx.translate(420,420);
    ctx.shadowColor = '#08001e';ctx.shadowBlur = 32;ctx.shadowOffsetY = 16;
    ctx.beginPath();ctx.arc(0,0,408,0,TWO_PI);ctx.fillStyle='#eebc6b';ctx.fill();
    ctx.shadowBlur = 0;ctx.shadowOffsetY = 0;
    ctx.beginPath();ctx.arc(0,0,396,0,TWO_PI);ctx.fillStyle='#54245b';ctx.fill();
    const step = TWO_PI / SEGMENTS.length;
    SEGMENTS.forEach((segment,i) => {
      const start = -Math.PI/2 + rotation + i * step;
      const end = start + step;
      const center = start + step / 2;
      const grd = ctx.createLinearGradient(Math.cos(center)*90,Math.sin(center)*90,Math.cos(center)*390,Math.sin(center)*390);
      grd.addColorStop(0,segment.c[0]);grd.addColorStop(1,segment.c[1]);
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,381,start,end);ctx.closePath();
      ctx.fillStyle=grd;ctx.fill();ctx.strokeStyle='rgba(255,247,207,.94)';ctx.lineWidth=5;ctx.stroke();
      ctx.save();ctx.translate(Math.cos(center)*242,Math.sin(center)*242);
      ctx.rotate(center + Math.PI/2);
      ctx.shadowColor='#18011f';ctx.shadowBlur=4;ctx.shadowOffsetY=2;
      const lines = segment.label === 'LOSE A TURN' ? ['LOSE A','TURN'] : segment.label === 'MYSTERY PRIZE' ? ['MYSTERY','PRIZE'] : segment.label === 'FREE SPIN' ? ['FREE','SPIN'] : [segment.label];
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';
      ctx.font=`1000 ${lines.length > 1 ? 23 : segment.kind === 'bankrupt' ? 23 : 33}px Trebuchet MS, sans-serif`;
      lines.forEach((line,idx)=>{
        const y=(idx-(lines.length-1)/2)*28;
        ctx.lineWidth=4;ctx.strokeStyle='#3715459c';ctx.strokeText(line,0,y);
        ctx.fillText(line,0,y);
      });
      ctx.restore();
    });
    ctx.beginPath();ctx.arc(0,0,381,0,TWO_PI);ctx.lineWidth=9;ctx.strokeStyle='#fff2b2b5';ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,400,0,TWO_PI);ctx.lineWidth=13;ctx.strokeStyle='#f8cd75';ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,409,0,TWO_PI);ctx.lineWidth=7;ctx.strokeStyle='#fff4bc';ctx.stroke();
    for(let i=0;i<42;i++){
      const a=i*TWO_PI/42;const x=Math.cos(a)*399,y=Math.sin(a)*399;
      ctx.beginPath();ctx.arc(x,y,i%3===0?5:3.5,0,TWO_PI);
      ctx.fillStyle=i%3===0?'#fff6ce':'#fff1a9';ctx.shadowColor='#ffeaa5';ctx.shadowBlur=10;ctx.fill();
    }
    ctx.shadowBlur=0;ctx.restore();
  }

  function beginSpin() {
    if (!isActive() || state.phase !== 'spin' || spinning || solveOpen) return;
    spinning=true;selection=null;state.deadline=null;
    const winnerIndex=randInt(SEGMENTS.length);
    const fraction=.20 + (randInt(6000) / 10000); // safely inside segment
    const step=TWO_PI/SEGMENTS.length;
    const desired=-((winnerIndex+fraction)*step);
    const current=state.wheelRotation;
    const travel=((desired-current)%TWO_PI + TWO_PI)%TWO_PI;
    const turns=6+randInt(3);
    const full=turns*TWO_PI+travel;
    const duration=5400+randInt(900);
    const start=performance.now();
    state.lastSegment=null;state.message=`${activePlayer().name} is spinning the wheel…`;
    render();
    let tickSector=Math.floor(current/step);
    const ease=t=>1-Math.pow(1-t,4.5);
    function frame(time){
      const fraction=Math.min((time-start)/duration,1);
      const nextRotation=current+full*ease(fraction);
      drawWheel(nextRotation);
      const sector=Math.floor(nextRotation/step);
      if(sector!==tickSector && time-tickLast>40){
        tickSector=sector;tickLast=time;sound('tick');
        els.pointer.classList.remove('ticking');void els.pointer.offsetWidth;els.pointer.classList.add('ticking');
      }
      if(fraction<1) requestAnimationFrame(frame);
      else {
        spinning=false;
        state.wheelRotation=((nextRotation%TWO_PI)+TWO_PI)%TWO_PI;
        const result=SEGMENTS[wheelIndex(state.wheelRotation)];
        if(result!==SEGMENTS[winnerIndex]) console.warn('Wheel alignment difference detected');
        state.lastSegment=result.label;
        sound(result.kind==='bankrupt'?'bankrupt':'stop');
        handleLanding(result);
      }
    }
    requestAnimationFrame(frame);
  }

  function handleLanding(segment){
    const who=activePlayer();state.spinValue=0;state.mysteryValue=0;
    if(segment.kind==='cash') {
      state.spinValue=segment.points;
      state.phase='guess';
      state.deadline=Date.now()+TURN_SECONDS*1000;
      state.message=`${who.name} landed on ${cash(segment.points)}! Pick a consonant within ${TURN_SECONDS} seconds.`;
    } else if(segment.kind==='mystery') {
      state.mysteryValue=[1000,1500,2000,2500][randInt(4)];
      state.phase='guess';state.deadline=Date.now()+TURN_SECONDS*1000;
      state.message=`Mystery prize! Guess a consonant to win a surprise amount.`;
    } else if(segment.kind==='free') {
      who.freeSpins++;state.phase='spin';state.deadline=null;
      state.message=`${who.name} won a Free Spin token! Spin again.`;
      sound('bonus');
    } else if(segment.kind==='bankrupt') {
      who.roundScore=0;
      advanceTurn(`${who.name} hit BANKRUPT and lost their round score!`,false);
    } else {
      advanceTurn(`${who.name} landed on LOSE A TURN.`,true);
    }
    selection=null;save();render();
    els.spinResult.classList.remove('highlight');void els.spinResult.offsetWidth;els.spinResult.classList.add('highlight');
  }

  function advanceTurn(reason, canUseToken=true) {
    const who=activePlayer();
    if (canUseToken && who.freeSpins>0) {
      who.freeSpins--;
      state.message=`${reason} A Free Spin token was used. ${who.name} keeps the turn!`;
    } else {
      state.active=(state.active+1)%state.players.length;
      state.message=`${reason} ${activePlayer().name}, it's your turn!`;
    }
    state.phase='spin';state.spinValue=0;state.mysteryValue=0;state.deadline=null;
    state.lastSegment=null;
    selection=null;solveOpen=false;
    els.solveInput.value='';
  }

  function selectLetter(letter){
    if (!letter || !ALPHABET.includes(letter) || spinning || solveOpen) return;
    if (state.status==='bonusPick') {
      if(AUTO_BONUS.includes(letter) || state.bonusPicks.includes(letter)) return;
      const vowelCount=state.bonusPicks.filter(isVowel).length;
      const consonantCount=state.bonusPicks.length-vowelCount;
      if ((isVowel(letter) && vowelCount>=1) || (!isVowel(letter) && consonantCount>=3)) return;
      selection=letter;renderKeyboard();return;
    }
    if (!isActive() || state.used.includes(letter)) return;
    if (state.phase==='guess' && isVowel(letter)) return;
    if (state.phase==='vowel' && !isVowel(letter)) return;
    if (!['guess','vowel'].includes(state.phase)) return;
    selection=letter;renderKeyboard();
  }

  function submitLetter(){
    const letter=selection;
    if (!letter || spinning || solveOpen) return;
    if(state.status==='bonusPick') {
      if(AUTO_BONUS.includes(letter) || state.bonusPicks.includes(letter)) return;
      const consonants=state.bonusPicks.filter(l=>!isVowel(l)).length;
      const vowels=state.bonusPicks.filter(isVowel).length;
      if ((isVowel(letter)&&vowels>=1)||(!isVowel(letter)&&consonants>=3)) return;
      state.bonusPicks.push(letter);
      selection=null;
      if(state.bonusPicks.length===4) {
        state.status='bonusPlay';state.deadline=Date.now()+BONUS_SECONDS*1000;
        state.message=`Bonus letters revealed! Solve the puzzle in ${BONUS_SECONDS} seconds!`;
        sound('bonus');
      } else {
        state.message=`Bonus selection: ${state.bonusPicks.filter(l=>!isVowel(l)).length}/3 consonants, ${state.bonusPicks.filter(isVowel).length}/1 vowel.`;
        sound('correct');
      }
      save();render();return;
    }
    if(!isActive() || !['guess','vowel'].includes(state.phase) || state.used.includes(letter)) return;
    if ((state.phase==='guess' && isVowel(letter)) || (state.phase==='vowel' && !isVowel(letter))) return;
    const vowelBuy=state.phase==='vowel';
    if (vowelBuy) {
      if(activePlayer().roundScore<250) return;
      activePlayer().roundScore-=250;
    }
    state.used.push(letter);
    selection=null;
    const count=countsInPuzzle(letter);
    if(count>0) {
      state.revealed.push(letter);
      if(!vowelBuy) {
        const prize=state.mysteryValue || state.spinValue*count;
        activePlayer().roundScore+=prize;
        state.message=state.mysteryValue
          ? `${letter} appears ${count} time${count===1?'':'s'}! Mystery prize: +${cash(prize)}!`
          : `${letter} appears ${count} time${count===1?'':'s'}! +${cash(prize)} points!`;
      } else state.message=`Nice! There ${count===1?'is':'are'} ${count} ${letter}${count>1?'s':''}. Spin again or solve!`;
      sound('correct');
      state.phase='spin';state.deadline=null;state.spinValue=0;state.mysteryValue=0;
      if(allRevealed()){ completeRound();return; }
    } else {
      sound('wrong');
      advanceTurn(`No ${letter} in this puzzle.`,true);
    }
    save();render();
  }

  function buyVowel(){
    if (!isActive() || spinning || solveOpen || activePlayer().roundScore < 250 || state.phase!=='spin') return;
    if('AEIOU'.split('').every(c=>state.used.includes(c))) return;
    state.phase='vowel';state.deadline=Date.now()+TURN_SECONDS*1000;
    state.message=`Select a vowel within ${TURN_SECONDS} seconds. A guess costs 250 points.`;
    selection=null;save();render();
  }
  function openSolve(){
    if (spinning || solveOpen || !['playing','bonusPlay'].includes(state.status)) return;
    solveOpen=true;selection=null;render();els.solveInput.focus();
  }
  function closeSolve(){solveOpen=false;els.solveInput.value='';render();}
  function submitSolve(){
    if(!solveOpen || !['playing','bonusPlay'].includes(state.status)) return;
    const guess=norm(els.solveInput.value);
    if(!guess){els.solveInput.focus();return;}
    if(guess===norm(puzzle().answer)) {
      solveOpen=false;els.solveInput.value='';
      if(state.status==='bonusPlay') completeBonus(true);
      else completeRound();
    } else if(state.status==='bonusPlay') {
      sound('wrong');state.message='Not quite! Keep trying before the timer runs out.';
      els.solveInput.value='';render();els.solveInput.focus();
    } else {
      sound('wrong');advanceTurn(`Incorrect solution from ${activePlayer().name}.`,true);
      save();render();
    }
  }
  function completeRound(){
    const winner=activePlayer();winner.total+=winner.roundScore;
    state.status='roundComplete';state.deadline=null;state.phase='spin';
    state.message=`${winner.name} solved the puzzle and banked ${cash(winner.roundScore)} points!`;
    sound('win');save();render();showRoundModal(winner);launchConfetti(105);
  }
  function nextRound(){
    if(state.status!=='roundComplete') return;
    state.round++;
    state.players.forEach(p=>{p.roundScore=0;p.freeSpins=0;});
    state.revealed=[];state.used=[];state.phase='spin';state.lastSegment=null;
    state.spinValue=0;state.mysteryValue=0;state.deadline=null;state.hintShown=false;
    selection=null;solveOpen=false;els.solveInput.value='';
    if(state.round<=5){
      state.status='playing';state.active=(state.active+1)%state.players.length;
      state.message=`Round ${state.round}! ${activePlayer().name} starts this round.`;
      save();render();hideModal();
    } else startBonus();
  }
  function startBonus(){
    let best=0;
    state.players.forEach((p,i)=>{if(p.total>state.players[best].total)best=i;});
    state.bonusPlayer=best;state.active=best;state.bonusPicks=[];
    state.status='bonusPick';state.phase='bonus';state.deadline=null;
    state.bonusPrize=[5000,10000,15000,25000,50000][randInt(5)];
    state.message=`${activePlayer().name} enters the bonus round! Choose 3 consonants and 1 vowel.`;
    sound('win');save();render();showBonusModal();launchConfetti(90);
  }
  function completeBonus(won){
    if(state.status!=='bonusPlay') return;
    state.bonusWon=won;
    if(won){
      activePlayer().total+=state.bonusPrize;
      sound('win');launchConfetti(180);
      state.message=`Amazing! ${activePlayer().name} won the mystery bonus of ${cash(state.bonusPrize)}!`;
    } else {
      sound('wrong');
      state.message=`Time is up! The bonus answer was ${puzzle().answer}.`;
    }
    state.status='finished';state.deadline=null;
    save();render();showFinishModal(won);
  }

  function updateTimer(){
    let secs=null;
    if(state.deadline && ((state.status==='playing' && ['guess','vowel'].includes(state.phase)) || state.status==='bonusPlay')) {
      secs=Math.max(0, Math.ceil((state.deadline-Date.now())/1000));
    }
    els.timer.textContent=secs===null?'--':String(secs).padStart(2,'0');
    els.timerBox.classList.toggle('urgent',secs!==null&&secs<=5);
    if(secs!==0 || spinning) return;
    if(state.status==='bonusPlay') completeBonus(false);
    else if (state.status==='playing' && ['guess','vowel'].includes(state.phase)) {
      sound('wrong');advanceTurn('Time is up!',true);save();render();
    }
  }

  function renderScores(){
    els.score.style.setProperty('--score-columns', String(state.players.length || 4));
    if(!state.players.length){
      els.score.innerHTML=Array.from({length:4},(_,i)=>`<div class="player-score" style="--player-color:${PLAYER_COLORS[i]}"><div class="score-upper"><span><span class="score-avatar">${i+1}</span> Player ${i+1}</span></div><div class="score-amount"><strong>0</strong><small>TOTAL POINTS</small></div></div>`).join('');
      return;
    }
    els.score.innerHTML=state.players.map((p,i)=>{
      return `<div class="player-score ${i===state.active && !['roundComplete','finished'].includes(state.status)?'active':''}" style="--player-color:${PLAYER_COLORS[i]}">
        <div class="score-upper"><span class="score-name"><span class="score-avatar">${i+1}</span>${escapeHTML(p.name)}</span><span class="active-tag">${i===state.active && !['roundComplete','finished'].includes(state.status)?'✦ ACTIVE':''}</span></div>
        <div class="score-amount"><strong>${cash(p.total)}</strong><small>ROUND <em>${cash(p.roundScore)}</em><br>TOTAL SCORE</small></div></div>`;
    }).join('');
  }
  function escapeHTML(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function renderPuzzle(){
    const p=puzzle();
    if(!p){els.category.textContent='Mystery category';els.board.innerHTML='<div class="announcement">Start a game to reveal your puzzle.</div>';return;}
    els.category.textContent=p.category;
    els.hintText.textContent=p.hint;
    els.hintText.hidden=!state.hintShown;
    els.hint.textContent=state.hintShown?'✧ Hide hint':'✧ Reveal a hint';
    const show=currentReveal();
    const words=p.answer.split(' ');
    els.board.innerHTML=words.map(word=>`<div class="word-group">${[...word].map(c=>{
      if(!/[A-Z]/.test(c))return `<span class="tile" aria-label="punctuation">${escapeHTML(c)}</span>`;
      const revealed=show.includes(c) || state.status==='roundComplete' || state.status==='finished';
      const newly=revealed && !knownReveals.has(c);
      return `<span class="tile ${revealed?'revealed':'hidden-letter'} ${newly?'newly':''}" aria-label="${revealed?c:'hidden letter'}">${revealed?c:'&nbsp;'}</span>`;
    }).join('')}</div>`).join('');
    knownReveals=new Set(show);
    const uniqueTotal=totalLetters(p), count=[...p.answer].filter(c=>/[A-Z]/.test(c)&&(show.includes(c)||state.status==='roundComplete'||state.status==='finished')).length;
    els.progress.style.width=`${uniqueTotal?count/uniqueTotal*100:0}%`;
    els.progressText.textContent=`${count} / ${uniqueTotal}`;
  }
  function keyAllowed(letter){
    if(state.status==='bonusPick') {
      const cs=state.bonusPicks.filter(c=>!isVowel(c)).length;
      const vs=state.bonusPicks.filter(isVowel).length;
      return !AUTO_BONUS.includes(letter) && !state.bonusPicks.includes(letter) && (isVowel(letter)?vs<1:cs<3);
    }
    if(!isActive() || spinning || solveOpen || state.used.includes(letter))return false;
    return (state.phase==='guess' && !isVowel(letter)) || (state.phase==='vowel' && isVowel(letter));
  }
  function renderKeyboard(){
    els.keyboard.innerHTML=ALPHABET.map(letter=>{
      const used=state.used.includes(letter)||state.status.startsWith('bonus')&&(AUTO_BONUS.includes(letter)||state.bonusPicks.includes(letter));
      const disabled=!keyAllowed(letter);
      return `<button type="button" class="letter-key ${isVowel(letter)?'vowel':''} ${selection===letter?'selected':''} ${used?'used':''}" aria-label="Letter ${letter}${used?', already used':''}" aria-pressed="${selection===letter}" data-letter="${letter}" ${disabled?'disabled':''}>${letter}</button>`;
    }).join('');
    els.selected.textContent=selection||'—';
    els.guess.disabled=!selection || !keyAllowed(selection) || spinning;
    els.guess.textContent=state.status==='bonusPick'?'CHOOSE LETTER':state.phase==='vowel'?'GUESS VOWEL':'GUESS LETTER';
  }
  function renderTrack(){
    els.track.innerHTML=Array.from({length:6},(_,i)=>{
      const round=i+1;
      const finished=round<state.round || (round===6&&state.status==='finished');
      const current=round===state.round || (round===6&&state.status.startsWith('bonus'));
      return `<span class="round-chip ${finished?'done':''} ${current?'current':''} ${round===6?'bonus':''}" title="${round===6?'Bonus round':'Round '+round}">${round===6?'★':finished?'✓':round}</span>`;
    }).join('');
  }
  function render(){
    renderScores();renderPuzzle();renderKeyboard();renderTrack();
    const inBonus=state.status.startsWith('bonus');
    els.round.textContent=inBonus||state.status==='finished'?'★ BONUS ROUND':`ROUND ${Math.min(state.round,5)} OF 5`;
    els.banner.textContent=state.message;
    els.announcement.textContent=state.message;
    els.active.textContent=activePlayer()?.name||'Player 1';
    if(state.status==='bonusPick'){
      const consonants=state.bonusPicks.filter(l=>!isVowel(l)).length;
      const vowels=state.bonusPicks.filter(isVowel).length;
      els.prompt.textContent=`Select ${3-consonants} consonant${3-consonants===1?'':'s'} and ${1-vowels} vowel.`;
      els.letterNote.textContent='R, S, T, L, N and E are already revealed. Choose 3 consonants and 1 vowel.';
    } else if(state.status==='bonusPlay'){
      els.prompt.textContent=`Solve the bonus puzzle before the 30-second timer expires!`;
      els.letterNote.textContent='Bonus letters are locked. Focus on the full solution!';
    } else {
      els.prompt.textContent=spinning?'The wheel is spinning…':state.phase==='guess'?'Choose a consonant and press GUESS LETTER.':state.phase==='vowel'?'Select a vowel and press GUESS VOWEL.':'Spin the wheel, buy a vowel, or solve!';
      els.letterNote.textContent=state.phase==='vowel'?'Each vowel costs 250 points, whether correct or incorrect.':'Consonants earn points. Vowels cost 250. You get 15 seconds per guess.';
    }
    els.freeSpin.innerHTML=`✦ Free spin tokens: <strong>${activePlayer()?.freeSpins||0}</strong>`;
    els.spin.disabled=!isActive()||state.phase!=='spin'||spinning||solveOpen;
    els.spin.textContent=spinning?'✦ SPINNING…':'⟳ SPIN THE WHEEL ✧';
    els.vowel.disabled=!isActive()||state.phase!=='spin'||spinning||solveOpen||(activePlayer()?.roundScore||0)<250||'AEIOU'.split('').every(c=>state.used.includes(c));
    els.solve.disabled=!['playing','bonusPlay'].includes(state.status)||spinning||solveOpen;
    els.solveArea.hidden=!solveOpen;
    els.spinResult.innerHTML=state.lastSegment?`<span>✦</span> ${escapeHTML(state.lastSegment)} <span>✦</span>`:'<span>✧</span> Spin to reveal your prize!';
    els.next.hidden=state.status!=='roundComplete';
    updateTimer();
    if(!spinning)drawWheel();
  }

  function showModal({kicker,title,description,content='',actions=[],emblem='✦'}){
    els.modalKicker.textContent=kicker;els.modalTitle.textContent=title;
    els.modalDescription.textContent=description;els.modalEmblem.textContent=emblem;
    els.modalContent.innerHTML=content;
    els.modalActions.innerHTML='';
    for(const action of actions){
      const button=document.createElement('button');button.type='button';button.className='button '+(action.primary?'button-gold':'button-outline');
      button.textContent=action.text;button.addEventListener('click',action.onClick);
      els.modalActions.appendChild(button);
    }
    els.modal.hidden=false;
  }
  function hideModal(){els.modal.hidden=true;}
  function showSetup(){
    state.status='setup';save();render();
    const options=Object.keys(window.PUZZLE_BANK).map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
    showModal({kicker:'WELCOME TO THE GRAND GAME SHOW',title:'Ready to play?',description:'Choose your players, difficulty and favorite puzzles. Your game saves automatically.',emblem:'🎡',content:`
      <div class="setup-grid">
      <div><label for="setupCount">PLAYERS</label><select id="setupCount"><option value="1">1 player</option><option value="2" selected>2 players</option><option value="3">3 players</option><option value="4">4 players</option></select></div>
      <div><label for="setupDifficulty">DIFFICULTY</label><select id="setupDifficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></div>
      <div style="grid-column:1/-1"><label for="setupCategory">PUZZLE CATEGORY</label><select id="setupCategory"><option value="all">Surprise me · All categories</option>${options}</select></div>
      </div><div id="setupNames" class="player-names"></div>`,
      actions:[{text:'✦ START THE SHOW',primary:true,onClick:startGameFromSetup}]});
    $('setupCount').addEventListener('change',renderSetupNames);
    renderSetupNames();
  }
  function renderSetupNames(){
    const n=Number($('setupCount').value);
    const existing=Array.from(els.modalContent.querySelectorAll('.player-names input')).map(e=>e.value);
    $('setupNames').innerHTML=Array.from({length:n},(_,i)=>`<div><label for="playerName${i}">PLAYER ${i+1} NAME</label><input id="playerName${i}" maxlength="18" value="${escapeHTML(existing[i]||'Player '+(i+1))}" placeholder="Player ${i+1}" autocomplete="off"></div>`).join('');
  }
  function startGameFromSetup(){
    const count=Number($('setupCount').value);
    const difficulty=$('setupDifficulty').value;
    const categoryFilter=$('setupCategory').value;
    const pool=window.PUZZLES.filter(p=>p.difficulty===difficulty && (categoryFilter==='all'||p.category===categoryFilter));
    if(pool.length<6){els.modalDescription.textContent='Not enough puzzles for that selection.';return;}
    const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=randInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    const players=Array.from({length:count},(_,i)=>({name:$(`playerName${i}`).value.trim().slice(0,18)||`Player ${i+1}`,total:0,roundScore:0,freeSpins:0}));
    state={...newState(),status:'playing',players,difficulty,categoryFilter,selectedPuzzles:shuffled.slice(0,6),message:`${players[0].name}, you're first! Give the wheel a spin.`};
    selection=null;solveOpen=false;knownReveals=new Set();save();hideModal();render();sound('bonus');
  }
  function showRoundModal(winner){
    showModal({kicker:`ROUND ${state.round} COMPLETE`,title:'PUZZLE SOLVED!',description:`${winner.name} cracked the code. The answer was “${puzzle().answer}”.`,emblem:'🏆',
      content:`<div class="modal-stat"><strong>+${cash(winner.roundScore)}</strong><span>POINTS BANKED THIS ROUND</span></div><div class="modal-score-list">${[...state.players].sort((a,b)=>b.total-a.total).map(p=>`<div class="modal-scoreline"><span>${escapeHTML(p.name)}</span><b>${cash(p.total)}</b></div>`).join('')}</div>`,
      actions:[{text:state.round===5?'★ BONUS ROUND':'NEXT ROUND →',primary:true,onClick:nextRound}]});
  }
  function showBonusModal(){
    showModal({kicker:'THE FINAL CHALLENGE',title:'BONUS ROUND!',description:`${activePlayer().name} leads the scoreboard and takes on the mystery prize!`,emblem:'★',content:`<div class="bonus-instructions"><strong>Step 1:</strong> R, S, T, L, N, E are revealed automatically.<br><strong>Step 2:</strong> Pick 3 different consonants and 1 vowel.<br><strong>Step 3:</strong> You get 30 seconds to solve the final puzzle.<br><strong>Prize:</strong> A secret bonus value, revealed if you win.</div>`,actions:[{text:'LET’S DO THIS ✦',primary:true,onClick:hideModal}]});
  }
  function showFinishModal(bonusWon){
    const sorted=[...state.players].sort((a,b)=>b.total-a.total);
    const high=sorted[0]?.total||0;
    const winners=sorted.filter(p=>p.total===high).map(p=>p.name);
    const champion=winners.length===1?winners[0]:winners.join(' & ');
    showModal({kicker:'THE SHOW IS OVER',title:winners.length>1?'IT’S A TIE!':'WE HAVE A WINNER!',description:`${champion} ${winners.length>1?'share the crown':'takes the crown'} with ${cash(high)} points! ${bonusWon?`Mystery bonus won: ${cash(state.bonusPrize)}!`:`Bonus answer: ${puzzle().answer}.`}`,emblem:'🏆',content:`<div class="modal-score-list">${sorted.map((p,i)=>`<div class="modal-scoreline"><span>${i===0?'🏆 ':''}${escapeHTML(p.name)}</span><b>${cash(p.total)}</b></div>`).join('')}</div><p style="font-size:12px;color:#f5d6fd">Thanks for playing. Ready for another spin?</p>`,actions:[{text:'✦ PLAY AGAIN',primary:true,onClick:()=>{state=newState();showSetup();}}]});
  }

  function launchConfetti(amount){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(confettiFrame)cancelAnimationFrame(confettiFrame);
    const canvas=els.confetti;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const width=window.innerWidth,height=window.innerHeight;
    canvas.width=width*dpr;canvas.height=height*dpr;
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    const colors=['#ffd67c','#ef68be','#65d6ff','#87f0c5','#bb87ff','#ffffff'];
    const bits=Array.from({length:amount},()=>({x:Math.random()*width,y:-Math.random()*height*.8-20,vx:(Math.random()-.5)*4,vy:2+Math.random()*5,size:4+Math.random()*7,rotation:Math.random()*TWO_PI,vr:(Math.random()-.5)*.15,color:colors[randInt(colors.length)]}));
    const start=performance.now();
    function step(now){
      ctx.clearRect(0,0,width,height);
      const alpha=Math.min(1,Math.max(0,(4600-(now-start))/900));ctx.globalAlpha=alpha;
      for(const b of bits){
        b.x+=b.vx;b.y+=b.vy;b.vy+=.06;b.rotation+=b.vr;
        ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rotation);ctx.fillStyle=b.color;
        ctx.fillRect(-b.size/2,-b.size/2,b.size,b.size*.55);ctx.restore();
      }
      if(now-start<4600){confettiFrame=requestAnimationFrame(step);}else{ctx.clearRect(0,0,width,height);confettiFrame=null;}
    }
    confettiFrame=requestAnimationFrame(step);
  }

  function onKey(event){
    if(event.ctrlKey||event.altKey||event.metaKey || state.status==='setup' || !els.modal.hidden)return;
    if(event.target && ['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) {
      if(event.key==='Enter' && event.target===els.solveInput){event.preventDefault();submitSolve();}
      if(event.key==='Escape'&&solveOpen)closeSolve();
      return;
    }
    if(event.key.length===1 && /[a-z]/i.test(event.key)) selectLetter(event.key.toUpperCase());
    else if(event.key==='Enter' && selection){event.preventDefault();submitLetter();}
    else if(event.code==='Space' && isActive() && state.phase==='spin'){event.preventDefault();beginSpin();}
    else if(event.key==='Escape' && solveOpen)closeSolve();
  }
  function newGame(){
    if(spinning)return;
    if(state.status==='playing'||state.status==='bonusPick'||state.status==='bonusPlay'||state.status==='roundComplete'){
      if(!window.confirm('Start a new game? Your current game progress will be replaced.'))return;
    }
    state=newState();selection=null;solveOpen=false;knownReveals=new Set();showSetup();
  }
  function init(){
    els.spin.addEventListener('click',beginSpin);
    els.guess.addEventListener('click',submitLetter);
    els.vowel.addEventListener('click',buyVowel);
    els.solve.addEventListener('click',openSolve);
    els.submitSolve.addEventListener('click',submitSolve);
    els.cancelSolve.addEventListener('click',closeSolve);
    els.next.addEventListener('click',nextRound);
    els.newGame.addEventListener('click',newGame);
    els.keyboard.addEventListener('click',e=>{const btn=e.target.closest('[data-letter]');if(btn && !btn.disabled)selectLetter(btn.dataset.letter);});
    els.hint.addEventListener('click',()=>{if(!puzzle())return;state.hintShown=!state.hintShown;save();render();});
    els.sound.addEventListener('click',()=>{soundEnabled=!soundEnabled;els.sound.setAttribute('aria-pressed',String(soundEnabled));els.sound.innerHTML=soundEnabled?'🔊 <span>Sound on</span>':'🔇 <span>Sound off</span>';if(soundEnabled)sound('correct');});
    window.addEventListener('keydown',onKey);
    window.setInterval(updateTimer,200);
    if(!window.PUZZLES || window.PUZZLES.length!==240)throw new Error('Puzzle data not loaded');
    render();
    if(state.status==='setup')showSetup();
    else if(state.status==='roundComplete')showRoundModal(activePlayer());
    else if(state.status==='bonusPick')showBonusModal();
    else if(state.status==='finished')showFinishModal(state.bonusWon);
    else hideModal();
  }
  init();
  // Expose a read-only snapshot for convenient manual testing in the console.
  window.FortuneWheel = Object.freeze({getState:()=>JSON.parse(JSON.stringify(state)),getWheelIndex:wheelIndex});
})();