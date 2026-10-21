/*
 * SweetPlayFront.jsx —— 前台画面：顾客进店、说想要什么、在柜台前排队；
 * 柜台上有点单平板；蛋糕从后厨做好后，回到这里点顾客出餐。
 *
 * 背景图和柜台图在 sweetStreetData.js 的 SWEET_STREET_IMAGES（frontBackground / frontCounter），
 * 留空就用内置的粉色墙面和木头柜台。
 */

import React, { useEffect } from 'react';
import { SWEET_STREET_IMAGES } from './sweetStreetData';
import { getCookRecipe } from './sweetPlayEngine';
import SweetPlayOrder from './SweetPlayOrder';
import { CakeArt, CustomerFigure, PatienceBar, getCustomerMood } from './SweetPlayArt';

const isReady = (customer) => customer.status === 'cooking' && customer.grades.length >= 4;

const SweetPlayFront = ({
  run,
  orderingId,
  onOpenOrder,
  onCloseOrder,
  onSubmitTicket,
  onServe,
  onNotify,
}) => {
  const orderingCustomer = orderingId !== null
    ? run.customers.find((c) => c.id === orderingId && c.status === 'waiting')
    : null;

  // 点单的时候这位客人走掉了，就把平板收起来
  useEffect(() => {
    if (orderingId !== null && !orderingCustomer) onCloseOrder();
  }, [orderingId, orderingCustomer, onCloseOrder]);

  const handleCustomer = (customer) => {
    if (customer.status === 'waiting') onOpenOrder(customer.id);
    else if (isReady(customer)) onServe(customer.id);
    else onNotify('蛋糕还在后厨，切到后厨去做吧');
  };

  const handleTablet = () => {
    const next = run.customers.find((c) => c.status === 'waiting');
    if (next) onOpenOrder(next.id);
    else onNotify('现在没有等着点单的客人');
  };

  const bgStyle = SWEET_STREET_IMAGES.frontBackground
    ? { backgroundImage: `url(${SWEET_STREET_IMAGES.frontBackground})` }
    : undefined;
  const counterStyle = SWEET_STREET_IMAGES.frontCounter
    ? { backgroundImage: `url(${SWEET_STREET_IMAGES.frontCounter})` }
    : undefined;

  const renderBubble = (customer) => {
    if (customer.status === 'waiting') {
      return <div className="sp-bubble is-order">{customer.line}</div>;
    }
    if (isReady(customer)) {
      return (
        <div className="sp-bubble is-ready">
          <b>好了吗？</b>
          <small>点我出餐</small>
        </div>
      );
    }
    const cooking = getCookRecipe(customer);
    return (
      <div className="sp-bubble is-cooking">
        {cooking && <CakeArt recipeId={cooking.id} size={34} />}
        <small>制作中</small>
      </div>
    );
  };

  return (
    <div className="sp-front">
      <div className={`sp-front-bg ${bgStyle ? 'has-image' : ''}`} style={bgStyle}>
        {!bgStyle && (
          <>
            <div className="sp-front-window" />
            <div className="sp-front-window is-right" />
          </>
        )}
      </div>

      <div className="sp-front-stage" style={{ '--sp-cols': Math.max(2, run.maxCustomers) }}>
        {run.customers.map((customer) => (
          <button
            key={customer.id}
            type="button"
            className={`sp-cust ${isReady(customer) ? 'is-ready' : ''}`}
            onClick={() => handleCustomer(customer)}
          >
            {renderBubble(customer)}
            <CustomerFigure designId={customer.designId} mood={getCustomerMood(customer)} height={96} />
            <PatienceBar customer={customer} />
          </button>
        ))}
      </div>

      <div className={`sp-counter ${counterStyle ? 'has-image' : ''}`} style={counterStyle}>
        <button type="button" className="sp-tablet" onClick={handleTablet}>
          <span className="sp-tablet-screen">点单</span>
        </button>
      </div>

      {orderingCustomer && (
        <SweetPlayOrder
          key={orderingCustomer.id}
          customer={orderingCustomer}
          shopStar={run.shopStar}
          onSubmit={(recipeId, decoIds) => onSubmitTicket(orderingCustomer.id, recipeId, decoIds)}
          onClose={onCloseOrder}
        />
      )}
    </div>
  );
};

export default SweetPlayFront;
