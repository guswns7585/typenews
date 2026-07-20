"use client";

import { MonthlyRanking } from "@/components/ranking/monthly-ranking";

export function EventContent() {
  return (
    <div id="event-tab">
      <div className="event-header">
        <p>Type News Ranking</p>
        <h1>이달의 랭킹 &amp; 진행 중인 이벤트</h1>
      </div>

      <div className="ranking-event-wrapper">
        <MonthlyRanking />

        <div id="event-info-box">
          <div className="event-images-wrapper">
            <div className="event-image">
              <a href="https://smartstore.naver.com/sandunart" target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pride.jpg" alt="이벤트 이미지" />
              </a>
            </div>
            <div className="event-image">
              <a href="https://smartstore.naver.com/keypiece" target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prize.jpg" alt="경품2" />
              </a>
            </div>
          </div>
          <div className="event-description">
            <div className="event-name-wrapper">
              <h5>포피즈</h5>
              <h5>햄찌 키캡(랜덤)</h5>
            </div>
            <p>
              매월 순위를 집계하여 래플이 진행되며, <br />
              등수가 높을수록 당첨 확률이 올라갑니다.
            </p>
            <p>
              매월 1일 랭킹이 초기화되며, <br />
              당첨자는 로그인된 이메일로 개별 연락드립니다.
            </p>
            <p>
              일정 기간 내 회신이 없을 경우 당첨은 무효 처리되며, 재래플이 진행됩니다.
            </p>
            <p style={{ fontSize: "small" }}>-본 이벤트는 샌던아트 및 키피스룸의 협찬으로 진행됩니다-</p>
          </div>
          <div className="event-warning">
            <small>
              부정 행위 적발 시 경고 없이 당첨 자격이 박탈될 수 있습니다.
              <br />
              랭킹 마감은 매월 마지막날 13:00 입니다.
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
