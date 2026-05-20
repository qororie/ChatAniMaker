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

        // [3] コロリーとフローティングアイコンの大きさ（ピクセル）
        iconSize: 50,

        // [4] 左端・右端からどれくらい離すか（ピクセル）
        edgeOffset: 20,

        // [5] PCでの下からの高さ（ピクセル）※フッターなどに重ならないよう調整
        bottomOffset: 30,

        // [6] スマホ時の縮小率と余白
        mobileScale: 0.75,
        mobileEdgeOffset: 15,
        mobileBottomOffset: 15,
        mobileBreakpoint: 768,

        // [7] フローティングアイコン同士、またはコロリーとの間隔（ピクセル）
        socialGap: 10,

        // [8] フローティングアイコンをホバーした時の横幅（ピクセル）
        socialExpandedWidth: 108,

        // [9] フローティングアイコン。iconText または iconImage を設定できます。
        socialLinks: [
            {
                label: 'X',
                url: 'https://x.com/qororie1',
                ariaLabel: 'Xを開く',
                iconText: 'X',
                background: '#191919',
                color: '#F5F2E4',
            },
            {
                label: 'note',
                url: 'https://note.com/nifty_sloth9288',
                ariaLabel: 'noteを開く',
                iconText: 'n',
                background: '#F5F2E4',
                color: '#191919',
            },
            // 画像アイコンを使う場合の例:
            // {
            //     label: 'site',
            //     url: 'https://example.com',
            //     ariaLabel: 'サイトを開く',
            //     iconImage: './img/example-icon.png',
            //     iconAlt: 'site',
            //     background: '#F5F2E4',
            //     color: '#191919',
            // },
        ],

        // [10] 転がるスピード（ミリ秒単位: 1000 = 1秒）
        rollSpeed: 5000,

        // [11] 次に転がり始めるまでの「最短の待ち時間」（ミリ秒）
        minWait: 18000,

        // [12] 次に転がり始めるまでの「最長の待ち時間」（ミリ秒）
        maxWait: 36000,
    };
    // =========================================================

    // =========================================================
    // 2. プラグインを準備・実行する処理
    // =========================================================
    function initPlugin() {
        // (A) アニメーションを動かすための設定（CSS）を作成
        const style = document.createElement('style');
        const mobileIconSize = Math.floor(config.iconSize * config.mobileScale);
        style.innerHTML = `
            /* 全体の枠組み：画面のいちばん手前に固定 */
            #qororie-plugin-container {
                position: fixed;
                bottom: ${config.bottomOffset}px;
                left: ${config.edgeOffset}px;
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
            /* フローティングアイコン：コロリーの右上に自動配置 */
            #qororie-social-container {
                position: fixed;
                right: ${config.edgeOffset}px;
                bottom: ${config.bottomOffset + config.iconSize + config.socialGap}px;
                z-index: 2147483647 !important;
                display: flex;
                flex-direction: column;
                gap: ${config.socialGap}px;
                align-items: flex-end;
            }
            .qororie-social-link {
                width: ${config.iconSize}px;
                height: ${config.iconSize}px;
                padding: 0;
                box-sizing: border-box;
                border: 2px solid #191919;
                background: var(--qororie-social-bg, #F5F2E4);
                color: var(--qororie-social-color, #191919);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 0;
                letter-spacing: 0.12em;
                text-decoration: none;
                white-space: nowrap;
                overflow: hidden;
                transition: width .18s ease, transform .12s ease, box-shadow .18s ease, background .18s ease;
            }
            .qororie-social-link:hover,
            .qororie-social-link:focus-visible {
                width: ${config.socialExpandedWidth}px;
                padding: 0 10px;
                justify-content: flex-start;
                gap: ${config.socialGap}px;
                transform: translate(-2px, -2px);
                outline: none;
            }
            .qororie-social-icon {
                width: 18px;
                height: 18px;
                flex: 0 0 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                font-size: 15px;
                line-height: 1;
            }
            .qororie-social-icon img {
                display: block;
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            .qororie-social-label {
                width: 0;
                opacity: 0;
                transform: translateX(4px);
                overflow: hidden;
                transition: width .18s ease, opacity .16s ease, transform .16s ease;
            }
            .qororie-social-link:hover .qororie-social-label,
            .qororie-social-link:focus-visible .qororie-social-label {
                width: auto;
                opacity: 1;
                transform: translateX(0);
            }
            /* スマホなど画面が小さい時の自動縮小機能 */
            @media (max-width: ${config.mobileBreakpoint}px) {
                #qororie-plugin-container {
                    bottom: ${config.mobileBottomOffset}px;
                    left: ${config.mobileEdgeOffset}px;
                    width: ${mobileIconSize}px;
                    height: ${mobileIconSize}px;
                }
                #qororie-social-container {
                    right: ${config.mobileEdgeOffset}px;
                    bottom: ${config.mobileBottomOffset + mobileIconSize + config.socialGap}px;
                }
                .qororie-social-link {
                    width: ${mobileIconSize}px;
                    height: ${mobileIconSize}px;
                }
                .qororie-social-link:hover,
                .qororie-social-link:focus-visible {
                    width: ${Math.max(config.socialExpandedWidth * config.mobileScale, mobileIconSize)}px;
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

        // (D) フローティングアイコンを作成して、コロリーの右上に追加
        const socialContainer = document.createElement('div');
        socialContainer.id = 'qororie-social-container';
        socialContainer.setAttribute('aria-label', '外部リンク');

        config.socialLinks.forEach((item) => {
            const link = document.createElement('a');
            link.className = 'qororie-social-link';
            link.href = item.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute('aria-label', item.ariaLabel || `${item.label}を開く`);
            link.style.setProperty('--qororie-social-bg', item.background || '#F5F2E4');
            link.style.setProperty('--qororie-social-color', item.color || '#191919');

            const icon = document.createElement('span');
            icon.className = 'qororie-social-icon';

            if (item.iconImage) {
                const iconImage = document.createElement('img');
                iconImage.src = item.iconImage;
                iconImage.alt = item.iconAlt || item.label || '';
                icon.appendChild(iconImage);
            } else {
                icon.textContent = item.iconText || item.label || '';
            }

            const label = document.createElement('span');
            label.className = 'qororie-social-label';
            label.textContent = item.label || '';

            link.appendChild(icon);
            link.appendChild(label);
            socialContainer.appendChild(link);
        });

        document.body.appendChild(socialContainer);

        // =========================================================
        // 3. 右や左へ転がるアニメーション
        // =========================================================
        let isRight = false; // 現在、右側にいるかを記憶
        let rollTimeout;

        // 今の画面の余白を計算
        function getMargin() {
            return parseInt(window.getComputedStyle(container).left, 10) || config.edgeOffset;
        }

        // スクロールバーが出てもCSSの fixed 配置と同じ基準幅で計算する
        function getViewportWidth() {
            return document.documentElement.clientWidth || window.innerWidth;
        }

        // コロリーが右端に着く位置を計算
        function getMaxMove() {
            const viewportWidth = getViewportWidth();
            const currentIconSize = container.offsetWidth;
            const currentMargin = getMargin();
            return viewportWidth - currentIconSize - (currentMargin * 2);
        }

        // 右端にいる時だけ、現在の画面幅に合わせて位置を補正する
        function syncRightPosition() {
            if (!isRight) return;

            container.style.transition = 'none';
            container.style.transform = `translateX(${getMaxMove()}px)`;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    container.style.transition = `transform ${config.rollSpeed / 1000}s cubic-bezier(0.45, 0, 0.15, 1)`;
                });
            });
        }

        // 次の転がりまでのランダムな待ち時間を計算してタイマーをセット
        function scheduleNextRoll() {
            const timeDiff = config.maxWait - config.minWait;
            const nextTime = Math.random() * timeDiff + config.minWait;
            rollTimeout = setTimeout(roll, nextTime);
        }

        // 実際に転がる処理
        function roll() {
            // 画面の幅からアイコンの大きさを引いて、どこまで進むかを計算
            const maxMove = getMaxMove();

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
                syncRightPosition();
            }, 150);
        });

        // スクロールバーの出現など、resizeでは拾えないレイアウト幅の変化にも追従
        if ('ResizeObserver' in window) {
            let lastViewportWidth = getViewportWidth();
            const viewportObserver = new ResizeObserver(() => {
                const nextViewportWidth = getViewportWidth();
                if (nextViewportWidth === lastViewportWidth) return;

                lastViewportWidth = nextViewportWidth;
                syncRightPosition();
            });
            viewportObserver.observe(document.documentElement);
        }
    }

    // ページの読み込みが終わったらプラグインを起動する
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlugin);
    } else {
        initPlugin();
    }
})();
