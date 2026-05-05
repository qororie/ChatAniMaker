/**
 * Qororie Rolling Animation Plugin
 */
(function () {
    // =========================================================
    // 1. 設定エリア
    // =========================================================
    const config = {
        // [1] 画像のファイル名（同じフォルダにある場合はそのままでOK）
        imagePath: './img/qororie-main.svg',

        // [2] クリックしたときの移動先のURL
        linkUrl: 'https://note.com/nifty_sloth9288',

        // [3] アイコンの大きさ（ピクセル）
        iconSize: 45,

        // [4] 転がるスピード（ミリ秒単位: 1000 = 1秒）
        rollSpeed: 5000,

        // [5] 左端・右端からどれくらい離すか（ピクセル）
        margin: 20,

        // [6] 次に転がり始めるまでの「最短の待ち時間」（ミリ秒）
        minWait: 18000,

        // [7] 次に転がり始めるまでの「最長の待ち時間」（ミリ秒）
        maxWait: 36000,

        // [8] PCでの下からの高さ（ピクセル）※フッターなどに重ならないよう調整
        // スマホ（@media (max-width: 768px)は15px固定       
        bottomOffset: 12,
    };
    // =========================================================

    // =========================================================
    // 2. プラグインを準備・実行する処理
    // =========================================================
    function initPlugin() {
        // (A) アニメーションを動かすための設定（CSS）を作成
        const style = document.createElement('style');
        style.innerHTML = `
            /* 全体の枠組み：画面のいちばん手前に固定 */
            #qororie-plugin-container {
                position: fixed;
                bottom: ${config.bottomOffset}px;
                left: ${config.margin}px;
                width: ${config.iconSize}px;
                height: ${config.iconSize}px;
                z-index: 2147483647 !important;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none; /* 枠の裏側にあるボタンなどもクリックできるようにする */
                transition: transform ${config.rollSpeed / 1000}s cubic-bezier(0.45, 0, 0.15, 1);
            }
            /* ぐるぐる回転する動きを担当 */
            #qororie-plugin-rotator {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform ${config.rollSpeed / 1000}s cubic-bezier(0.45, 0, 0.15, 1);
            }
            /* 最終的な画像の見た目と、クリックできるようにする設定 */
            #qororie-plugin-image {
                width: 100%;
                height: auto;
                transition: transform 0.4s ease;
                filter: drop-shadow(0px 10px 20px rgba(0,0,0,0.3));
                pointer-events: auto; /* 画像本体だけはクリックできるようにする */
                cursor: pointer;      /* マウスを乗せると「指のマーク」になる */
            }
            /* スマホなど画面が小さい時の自動縮小機能 */
            @media (max-width: 768px) {
                #qororie-plugin-container {
                    width: ${Math.floor(config.iconSize * 0.75)}px;
                    height: ${Math.floor(config.iconSize * 0.75)}px;
                    bottom: 15px;
                    left: 15px;
                }
            }
        `;
        document.head.appendChild(style);

        // (B) アニメーション用の枠と画像を作成して、画面に追加
        const container = document.createElement('div');
        container.id = 'qororie-plugin-container';

        const rotator = document.createElement('div');
        rotator.id = 'qororie-plugin-rotator';

        const img = document.createElement('img');
        img.id = 'qororie-plugin-image';
        img.src = config.imagePath;
        img.alt = 'Qororie Animation';

        // (C) 画像がクリックされたときに、設定したURL（Google）を新しいタブ（別ウィンドウ）で開く
        img.addEventListener('click', () => {
            window.open(config.linkUrl, '_blank', 'noopener,noreferrer');
        });

        rotator.appendChild(img);
        container.appendChild(rotator);
        document.body.appendChild(container);

        // =========================================================
        // 3. 右や左へ転がるアニメーション
        // =========================================================
        let isRight = false; // 現在、右側にいるかを記憶
        let rollTimeout;

        // 今の画面の余白を計算
        function getMargin() {
            return parseInt(window.getComputedStyle(container).left, 10) || config.margin;
        }

        // 次の転がりまでのランダムな待ち時間を計算してタイマーをセット
        function scheduleNextRoll() {
            const timeDiff = config.maxWait - config.minWait;
            const nextTime = Math.random() * timeDiff + config.minWait;
            rollTimeout = setTimeout(roll, nextTime);
        }

        // 実際に転がる処理
        function roll() {
            const windowWidth = window.innerWidth;
            const currentIconSize = container.offsetWidth;
            const currentMargin = getMargin();
            // 画面の幅からアイコンの大きさを引いて、どこまで進むかを計算
            const maxMove = windowWidth - currentIconSize - (currentMargin * 2);

            if (!isRight) {
                // 左から右へ向かう
                img.style.transform = `scaleX(1)`;
                container.style.transform = `translateX(${maxMove}px)`;
                rotator.style.transform = `rotate(1080deg)`;

                setTimeout(() => {
                    img.style.transform = `scaleX(-1)`;
                    isRight = true;
                    scheduleNextRoll();
                }, config.rollSpeed);
            } else {
                // 右から左へ向かう
                container.style.transform = `translateX(0px)`;
                rotator.style.transform = `rotate(0deg)`;

                setTimeout(() => {
                    img.style.transform = `scaleX(1)`;
                    isRight = false;
                    scheduleNextRoll();
                }, config.rollSpeed);
            }
        }

        // ページが表示されてから「2秒後」に最初の転がりを開始
        setTimeout(roll, 2000);

        // 画面のサイズが変わったときに、アイコンがはみ出さないように位置を直す
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (isRight) {
                    const windowWidth = window.innerWidth;
                    const currentMargin = getMargin();
                    const currentIconSize = container.offsetWidth;
                    const maxMove = windowWidth - currentIconSize - (currentMargin * 2);

                    container.style.transition = 'none';
                    container.style.transform = `translateX(${maxMove}px)`;

                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            container.style.transition = `transform ${config.rollSpeed / 1000}s cubic-bezier(0.45, 0, 0.15, 1)`;
                        });
                    });
                }
            }, 150);
        });
    }

    // ページの読み込みが終わったらプラグインを起動する
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlugin);
    } else {
        initPlugin();
    }
})();
