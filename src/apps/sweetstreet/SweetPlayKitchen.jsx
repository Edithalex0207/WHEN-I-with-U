/*
 * SweetPlayKitchen.jsx —— 后厨画面：四步做一块蛋糕。
 *
 *   选料    按配方顺序点材料，点错一次这步就算失误
 *   烘焙    指针来回走，在绿色区域点「停」
 *   打奶油  按住灌奶油，在绿色区域松手
 *   装饰    按点单上的顺序点装饰
 *
 * 每做完一步，把「完美 / 普通 / 失误」交给外面的 onGrade（外面记进这一局的状态）。
 * 四步都做完后，蛋糕算做好，回前台点顾客出餐。
 *
 * 后厨一直挂着（切到前台只是藏起来），所以做到一半切走也不会丢进度；
 * 但烘焙和打奶油进行中会通过 onLockChange 锁住底部的切换。
 */

import React, { useEffect, useRef, useState } from 'react';
import { SWEET_STREET_IMAGES } from './sweetStreetData';
import { SWEET_INGREDIENTS, SWEET_DECORATIONS } from './sweetPlayData';
import {
  getCookRecipe,
  buildIngredientShelf,
  buildDecoTray,
  checkSequencePick,
  judgeSequenceStep,
  judgeBake,
  judgeCream,
} from './sweetPlayEngine';
import {
  CakeArt,
  CustomerFigure,
  IngredientIcon,
  DecoIcon,
  PatienceBar,
  getCustomerMood,
} from './SweetPlayArt';

const STEP_KEYS = ['ingredients', 'bake', 'cream', 'decoration'];
const STEP_TITLES = {
  ingredients: '选料',
  bake: '烘焙',
  cream: '打奶油',
  decoration: '装饰',
};
const GRADE_TEXT = { perfect: '完美', normal: '不错', miss: '失误' };
const RESULT_PAUSE_MS = 900;

/** 烘焙和打奶油共用的刻度条：浅绿是普通区，深绿是完美区 */
const ZoneBar = ({ zone, value }) => (
  <div className="sp-zone">
    <i
      className="sp-zone-ok"
      style={{ left: `${zone.ok[0] * 100}%`, width: `${(zone.ok[1] - zone.ok[0]) * 100}%` }}
    />
    <i
      className="sp-zone-perfect"
      style={{ left: `${zone.perfect[0] * 100}%`, width: `${(zone.perfect[1] - zone.perfect[0]) * 100}%` }}
    />
    <b className="sp-zone-marker" style={{ left: `${value * 100}%` }} />
  </div>
);

const OvenArt = () => (
  <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden="true">
    <rect x="8" y="10" width="144" height="104" rx="18" fill="#F6C3D0" stroke="#C2456B" strokeWidth="4" />
    <rect x="22" y="38" width="116" height="62" rx="12" fill="#5B3A44" />
    <rect x="30" y="46" width="100" height="46" rx="8" fill="#FFB86B" opacity="0.55" />
    <circle cx="36" cy="24" r="6" fill="#fff" />
    <circle cx="56" cy="24" r="6" fill="#fff" />
    <rect x="96" y="19" width="42" height="10" rx="5" fill="#fff" />
  </svg>
);

const PipingBagArt = () => (
  <svg viewBox="0 0 80 100" width="64" height="80" aria-hidden="true">
    <path d="M14 8h52l-14 62H28z" fill="#fff" stroke="#C2456B" strokeWidth="3" strokeLinejoin="round" />
    <path d="M28 70h24l-6 20h-12z" fill="#FFD0DC" stroke="#C2456B" strokeWidth="3" strokeLinejoin="round" />
    <path d="M22 24c10 6 26 6 36 0" stroke="#F6C3D0" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

const SweetPlayKitchen = ({ run, paused, onGrade, onLockChange }) => {
  const [jobId, setJobId] = useState(null);
  const [step, setStep] = useState('ingredients');
  const [shelf, setShelf] = useState([]);
  const [seqDone, setSeqDone] = useState(0);
  const [seqWrong, setSeqWrong] = useState(0);
  const [flash, setFlash] = useState(null);
  const [bake, setBake] = useState({ phase: 'idle', pos: 0 });
  const [cream, setCream] = useState({ phase: 'idle', level: 0 });
  const [result, setResult] = useState(null);

  const seqStartRef = useRef(0);
  const timersRef = useRef([]);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const meterRef = useRef(0);
  const meterActiveRef = useRef(false);
  const jobRef = useRef(null);
  const pausedRef = useRef(false);

  jobRef.current = jobId;
  pausedRef.current = paused;

  const job = run.customers.find((c) => c.id === jobId) || null;
  const recipe = job ? getCookRecipe(job) : null;

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    timersRef.current.forEach(clearTimeout);
  }, []);

  // 做到一半，这位客人等不及走掉了：整个重置回单子列表
  useEffect(() => {
    if (jobId === null) return;
    if (run.customers.some((c) => c.id === jobId)) return;
    cancelAnimationFrame(rafRef.current);
    meterActiveRef.current = false;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setJobId(null);
    setResult(null);
    setBake({ phase: 'idle', pos: 0 });
    setCream({ phase: 'idle', level: 0 });
    onLockChange(false);
  }, [run.customers, jobId, onLockChange]);

  const enterStep = (customer, stepKey) => {
    const cookRecipe = getCookRecipe(customer);
    setStep(stepKey);
    setSeqDone(0);
    setSeqWrong(0);
    setFlash(null);
    setResult(null);
    setBake({ phase: 'idle', pos: 0 });
    setCream({ phase: 'idle', level: 0 });
    if (stepKey === 'ingredients') {
      setShelf(buildIngredientShelf(cookRecipe, run.shopStar, 8));
    } else if (stepKey === 'decoration') {
      setShelf(buildDecoTray({ decorations: customer.ticket.decoIds }, run.shopStar, 4));
    } else {
      setShelf([]);
    }
    seqStartRef.current = performance.now();
  };

  const startJob = (customer) => {
    setJobId(customer.id);
    enterStep(customer, STEP_KEYS[customer.grades.length] || 'decoration');
  };

  // 一步做完：记成绩，停一下给玩家看结果，再进下一步（最后一步做完就回单子列表）
  const finishStep = (grade) => {
    const customerSnapshot = job;
    const finishedStep = step;
    const customerId = jobId;
    onGrade(customerId, grade);
    setResult({ grade, step: finishedStep });
    const timer = setTimeout(() => {
      if (jobRef.current !== customerId) return;
      const nextIndex = STEP_KEYS.indexOf(finishedStep) + 1;
      if (nextIndex >= STEP_KEYS.length) {
        setJobId(null);
        setResult(null);
      } else {
        enterStep(customerSnapshot, STEP_KEYS[nextIndex]);
      }
    }, RESULT_PAUSE_MS);
    timersRef.current.push(timer);
  };

  // ---- 选料 / 装饰：按顺序点 ----
  const handlePick = (id) => {
    if (result || !job || !recipe) return;
    const expected = step === 'ingredients' ? recipe.ingredients : job.ticket.decoIds;
    if (expected.slice(0, seqDone).includes(id)) return;
    const check = checkSequencePick(expected, seqDone, id);
    if (!check.correct) {
      setSeqWrong((n) => n + 1);
      setFlash({ id, ok: false, n: Date.now() });
      return;
    }
    setFlash({ id, ok: true, n: Date.now() });
    setSeqDone(seqDone + 1);
    if (check.finished) {
      const elapsedSec = (performance.now() - seqStartRef.current) / 1000;
      finishStep(judgeSequenceStep({ wrongCount: seqWrong, elapsedSec, stepKey: step }));
    }
  };

  // ---- 烘焙 ----
  const stopBake = () => {
    if (!meterActiveRef.current) return;
    meterActiveRef.current = false;
    cancelAnimationFrame(rafRef.current);
    const pos = meterRef.current;
    setBake({ phase: 'done', pos });
    onLockChange(false);
    finishStep(judgeBake(recipe, pos));
  };

  const startBake = () => {
    if (bake.phase !== 'idle' || result || !recipe) return;
    meterRef.current = 0;
    lastTsRef.current = 0;
    meterActiveRef.current = true;
    setBake({ phase: 'running', pos: 0 });
    onLockChange(true);
    const loop = (ts) => {
      if (!meterActiveRef.current) return;
      if (!lastTsRef.current || pausedRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.1, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      if (!pausedRef.current) {
        meterRef.current = Math.min(1, meterRef.current + recipe.bake.speed * dt);
        setBake({ phase: 'running', pos: meterRef.current });
        if (meterRef.current >= 1) {
          stopBake();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // ---- 打奶油 ----
  const releaseCream = () => {
    if (!meterActiveRef.current) return;
    meterActiveRef.current = false;
    cancelAnimationFrame(rafRef.current);
    const level = meterRef.current;
    setCream({ phase: 'done', level });
    onLockChange(false);
    finishStep(judgeCream(recipe, level));
  };

  const pressCream = (event) => {
    if (cream.phase !== 'idle' || result || !recipe) return;
    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        // 个别浏览器不支持，忽略
      }
    }
    meterRef.current = 0;
    lastTsRef.current = 0;
    meterActiveRef.current = true;
    setCream({ phase: 'holding', level: 0 });
    onLockChange(true);
    const loop = (ts) => {
      if (!meterActiveRef.current) return;
      if (!lastTsRef.current || pausedRef.current) lastTsRef.current = ts;
      const dt = Math.min(0.1, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      if (!pausedRef.current) {
        meterRef.current = Math.min(1, meterRef.current + recipe.cream.fillPerSec * dt);
        setCream({ phase: 'holding', level: meterRef.current });
        if (meterRef.current >= 1) {
          releaseCream();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // ---------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------
  const bgStyle = SWEET_STREET_IMAGES.kitchenBackground
    ? { backgroundImage: `url(${SWEET_STREET_IMAGES.kitchenBackground})` }
    : undefined;

  const tickets = run.customers.filter((c) => c.status === 'cooking' && c.grades.length < 4);
  const readyCount = run.customers.filter((c) => c.status === 'cooking' && c.grades.length >= 4).length;

  const renderTicketList = () => (
    <div className="sp-ticket-list">
      <h3 className="sp-kitchen-title">后厨</h3>
      {tickets.length === 0 ? (
        <p className="sp-empty">
          {readyCount > 0 ? '蛋糕都做好了，回前台出餐吧' : '还没有单子，去前台接待客人吧'}
        </p>
      ) : (
        tickets.map((customer) => {
          const cooking = getCookRecipe(customer);
          const nextStep = STEP_KEYS[customer.grades.length];
          return (
            <button key={customer.id} type="button" className="sp-ticket" onClick={() => startJob(customer)}>
              <CustomerFigure designId={customer.designId} mood={getCustomerMood(customer)} height={52} />
              <div className="sp-ticket-info">
                <b>{cooking?.name}</b>
                <small>
                  下一步：{STEP_TITLES[nextStep]}（{customer.grades.length + 1}/4）
                </small>
                <PatienceBar customer={customer} />
              </div>
              {cooking && <CakeArt recipeId={cooking.id} size={46} />}
            </button>
          );
        })
      )}
      {tickets.length > 0 && readyCount > 0 && (
        <p className="sp-empty">还有 {readyCount} 块蛋糕做好了，在前台等出餐</p>
      )}
    </div>
  );

  const renderSequence = () => {
    const isIngredients = step === 'ingredients';
    const expected = isIngredients ? recipe.ingredients : job.ticket.decoIds;
    const dict = isIngredients ? SWEET_INGREDIENTS : SWEET_DECORATIONS;
    const Icon = isIngredients ? IngredientIcon : DecoIcon;
    const placed = expected.slice(0, seqDone);

    return (
      <>
        <div className="sp-recipe-strip">
          {expected.map((id, index) => (
            <span
              key={`${id}-${index}`}
              className={index < seqDone ? 'is-done' : index === seqDone ? 'is-now' : ''}
            >
              <Icon id={id} size={26} />
              {dict[id]?.name}
            </span>
          ))}
        </div>

        {!isIngredients && (
          <div className="sp-stage-cake">
            <CakeArt recipeId={recipe.id} stage={2} decoIds={placed} size={170} />
          </div>
        )}

        <div className={`sp-shelf ${isIngredients ? '' : 'is-tray'}`}>
          {shelf.map((item) => {
            const used = placed.includes(item.id);
            const flashed = flash && flash.id === item.id;
            return (
              <button
                key={`${item.id}-${flashed ? flash.n : 0}`}
                type="button"
                className={`sp-shelf-item ${flashed ? (flash.ok ? 'is-right' : 'is-wrong') : ''}`}
                disabled={used || Boolean(result)}
                onClick={() => handlePick(item.id)}
              >
                <Icon id={item.id} size={46} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
        <p className="sp-hint">
          {isIngredients ? '照着上面的配方顺序点材料' : '照着单子上的顺序点装饰'}
        </p>
      </>
    );
  };

  const renderBake = () => (
    <>
      <div className="sp-oven">
        {SWEET_STREET_IMAGES.oven ? (
          <img src={SWEET_STREET_IMAGES.oven} alt="" draggable={false} />
        ) : (
          <OvenArt />
        )}
        <div className="sp-oven-cake">
          <CakeArt recipeId={recipe.id} stage={bake.phase === 'idle' ? 0 : 1} size={92} />
        </div>
      </div>
      <ZoneBar zone={recipe.bake} value={bake.pos} />
      <button
        type="button"
        className="sp-btn primary big"
        disabled={Boolean(result) || bake.phase === 'done'}
        onClick={bake.phase === 'idle' ? startBake : stopBake}
      >
        {bake.phase === 'idle' ? '放进烤箱' : '停！'}
      </button>
      <p className="sp-hint">指针停在深绿色里最完美，烤过头就焦了</p>
    </>
  );

  const renderCream = () => (
    <>
      <div className="sp-stage-cake">
        <div className="sp-bag">
          {SWEET_STREET_IMAGES.pipingBag ? (
            <img src={SWEET_STREET_IMAGES.pipingBag} alt="" draggable={false} />
          ) : (
            <PipingBagArt />
          )}
        </div>
        <CakeArt recipeId={recipe.id} stage={cream.level > 0.45 ? 2 : 1} size={150} />
      </div>
      <ZoneBar zone={recipe.cream} value={cream.level} />
      <button
        type="button"
        className="sp-btn primary big sp-hold"
        disabled={Boolean(result) || cream.phase === 'done'}
        onPointerDown={pressCream}
        onPointerUp={releaseCream}
        onPointerCancel={releaseCream}
        onContextMenu={(event) => event.preventDefault()}
      >
        {cream.phase === 'holding' ? '松手！' : '按住灌奶油'}
      </button>
      <p className="sp-hint">在深绿色里松手最完美，灌满了会溢出来</p>
    </>
  );

  const renderJob = () => {
    const canLeave = !result
      && bake.phase === 'idle'
      && cream.phase === 'idle'
      && seqDone === 0
      && seqWrong === 0;
    const stepIndex = STEP_KEYS.indexOf(step);

    return (
      <div className="sp-job">
        <div className="sp-job-head">
          <button type="button" className="sp-link" disabled={!canLeave} onClick={() => setJobId(null)}>
            单子列表
          </button>
          <b>{recipe.name}</b>
          <PatienceBar customer={job} />
        </div>

        <ol className="sp-steps">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-now' : ''}>
              {STEP_TITLES[key]}
            </li>
          ))}
        </ol>

        <div className="sp-job-body">
          {(step === 'ingredients' || step === 'decoration') && renderSequence()}
          {step === 'bake' && renderBake()}
          {step === 'cream' && renderCream()}
          {result && (
            <div className={`sp-grade is-${result.grade}`}>
              {GRADE_TEXT[result.grade]}
              {result.step === 'decoration' && <small>蛋糕做好了，回前台出餐</small>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`sp-kitchen ${bgStyle ? 'has-image' : ''}`} style={bgStyle}>
      {job && recipe ? renderJob() : renderTicketList()}
    </div>
  );
};

export default SweetPlayKitchen;
