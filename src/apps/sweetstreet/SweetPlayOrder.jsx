/*
 * SweetPlayOrder.jsx —— 前台柜台上的点单平板。
 *
 * 顾客在气泡里说了想要什么，玩家在平板上：
 *   1) 选哪一款蛋糕
 *   2) 按顾客说的顺序，一个一个点装饰
 * 点错了不会提示，后厨会照着点的单去做（蛋糕点错最多 1 星，装饰顺序点错最多 2 星）。
 */

import React, { useState } from 'react';
import { SWEET_DECORATIONS } from './sweetPlayData';
import { getRecipe, getUnlockedRecipes, getUnlockedDecoIds } from './sweetPlayEngine';
import { CakeArt, CustomerFigure, DecoIcon, getCustomerMood } from './SweetPlayArt';

const SweetPlayOrder = ({ customer, shopStar, onSubmit, onClose }) => {
  const recipes = getUnlockedRecipes(shopStar);
  const decoIds = getUnlockedDecoIds(shopStar);
  const [recipeId, setRecipeId] = useState(null);
  const [picked, setPicked] = useState([]);

  const recipe = recipeId ? getRecipe(recipeId) : null;
  const slotCount = recipe ? recipe.decorations.length : 0;
  const canSubmit = Boolean(recipe) && picked.length === slotCount;

  const chooseRecipe = (id) => {
    const next = getRecipe(id);
    setRecipeId(id);
    setPicked((prev) => prev.slice(0, next.decorations.length));
  };

  const pickDeco = (id) => {
    if (!recipe || picked.length >= slotCount || picked.includes(id)) return;
    setPicked([...picked, id]);
  };

  const undo = () => setPicked((prev) => prev.slice(0, -1));

  return (
    <div className="sp-order" role="dialog" aria-label="点单">
      <div className="sp-order-pad">
        <div className="sp-order-top">
          <span className="sp-order-title">点单</span>
          <button type="button" className="sp-link" onClick={onClose}>先不点</button>
        </div>

        <div className="sp-order-line">
          <CustomerFigure designId={customer.designId} mood={getCustomerMood(customer)} height={64} />
          <p>{customer.line}</p>
        </div>

        <h4 className="sp-order-h">1　选蛋糕</h4>
        <div className="sp-order-cakes">
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`sp-order-cake ${recipeId === r.id ? 'is-on' : ''}`}
              onClick={() => chooseRecipe(r.id)}
            >
              <CakeArt recipeId={r.id} size={58} />
              <span>{r.name}</span>
            </button>
          ))}
        </div>

        <h4 className="sp-order-h">2　按顺序选装饰</h4>
        <div className="sp-order-slots">
          {recipe ? (
            Array.from({ length: slotCount }).map((_, index) => (
              <div key={index} className={`sp-order-slot ${picked[index] ? 'is-filled' : ''}`}>
                <em>{index + 1}</em>
                {picked[index] ? (
                  <>
                    <DecoIcon id={picked[index]} size={30} />
                    <span>{SWEET_DECORATIONS[picked[index]]?.name}</span>
                  </>
                ) : (
                  <span className="sp-order-slot-empty">空</span>
                )}
              </div>
            ))
          ) : (
            <p className="sp-order-tip">先选一款蛋糕</p>
          )}
          {picked.length > 0 && (
            <button type="button" className="sp-link" onClick={undo}>撤回一个</button>
          )}
        </div>

        <div className="sp-order-decos">
          {decoIds.map((id) => (
            <button
              key={id}
              type="button"
              className="sp-order-deco"
              disabled={!recipe || picked.includes(id) || picked.length >= slotCount}
              onClick={() => pickDeco(id)}
            >
              <DecoIcon id={id} size={34} />
              <span>{SWEET_DECORATIONS[id]?.name}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="sp-btn primary"
          disabled={!canSubmit}
          onClick={() => onSubmit(recipeId, picked)}
        >
          送去后厨
        </button>
      </div>
    </div>
  );
};

export default SweetPlayOrder;
