/**
 * LandingPageView - Product landing page for Plotailor & WorldCraft
 */

export class LandingPageView {
  private container: HTMLElement;
  private onNavigate: (tabId: string) => void;

  constructor(container: HTMLElement, onNavigate: (tabId: string) => void) {
    this.container = container;
    this.onNavigate = onNavigate;
  }

  render(): void {
    this.container.innerHTML = `
      <div class="landing-view">
        <!-- Hero Section -->
        <section class="hero-section">
          <div class="hero-pill">
            <span>✨</span> 次世代文学執筆 ＆ 世界構築 IDE
          </div>
          <h1 class="hero-title">
            作家の思考を途切れさせない、<br />世界観統合執筆環境
          </h1>
          <p class="hero-subtitle">
            ミリ秒単位の整合性監査、縦書き・ルビ原稿用紙組版、<br />
            そして端末内 5.8M 超軽量言語モデルが協調する、全く新しい創作体験。
          </p>
          <div class="hero-actions">
            <button class="btn-primary" id="btn-hero-editor">
              <span>✍️</span> エディタモックを触る
            </button>
            <button class="btn-secondary" id="btn-hero-debug">
              <span>🔬</span> Narrative-Nano 検証室
            </button>
          </div>
        </section>

        <!-- Feature Grid -->
        <section class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon">🏛️</div>
            <h3 class="feature-title">憲法順守 3ペイン統合UI</h3>
            <p class="feature-desc">
              単発モーダルダイアログの全面排除。左ペインの世界観・プロットツリー、中央の執筆面、右ペインのリアルタイム監査インスペクタが完全にドック連動。
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">📜</div>
            <h3 class="feature-title">青空文庫縦書き ＆ ルビ組版</h3>
            <p class="feature-desc">
              青空文庫記法（<code>｜親文字《るび》</code>、<code>《《傍点》》</code>）を完全解釈。縦書き・横書きの即座切り替えと、原稿用紙マス目プレビューに対応。
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">🧠</div>
            <h3 class="feature-title">Narrative-Nano (5.8M)</h3>
            <p class="feature-desc">
              Wasm SIMD と SPSC リングバッファにより、ブラウザ内で 10μs 未満のゼロディスラプション格解析（日本語10格動的バイアフィン）と認知フォグ判定を実行。
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">🛡️</div>
            <h3 class="feature-title">Proof of Process (PoP) 監査</h3>
            <p class="feature-desc">
              執筆者の思考と推敲プロセスを暗号学的 Merkle Hash Chain として不可逆記録。AI生成による盗作疑惑を払拭し、人間の創作証明を担保。
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">🪐</div>
            <h3 class="feature-title">多重衛星カレンダー＆儀式同期</h3>
            <p class="feature-desc">
              異世界カレンダーの通算日変換、二重満月（Conjunction）発生周期、歴史改変スライス（SCD Type 2）を厳密な数理アルゴリズムで自動整合。
            </p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">💾</div>
            <h3 class="feature-title">OPFS WAL クラッシュリカバリ</h3>
            <p class="feature-desc">
              Origin Private File System による高信頼性ストレージ。ブラウザクラッシュや予期せぬ電源断でも、WAL ログから直前の1文字まで瞬時に復元。
            </p>
          </div>
        </section>
      </div>
    `;

    // Event listeners
    this.container.querySelector('#btn-hero-editor')?.addEventListener('click', () => {
      this.onNavigate('editor');
    });

    this.container.querySelector('#btn-hero-debug')?.addEventListener('click', () => {
      this.onNavigate('debug');
    });
  }
}
