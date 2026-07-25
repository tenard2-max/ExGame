import { _decorator, Component } from 'cc';

import type { SaveSessionController } from '../save/save-session-controller';
import { DomSaveControlsUi } from './dom-save-controls-ui';

const { ccclass } = _decorator;

/**
 * 세이브 버튼 HUD 진입점입니다.
 * 실제 버튼은 DomSaveControlsUi(HTML)로 그려 클릭 오차를 없앱니다.
 */
@ccclass('SaveHud')
export class SaveHud extends Component {
  private readonly domUi = new DomSaveControlsUi();

  configure(saveSession: SaveSessionController): void {
    this.domUi.mount(saveSession);
  }

  protected onDestroy(): void {
    this.domUi.destroy();
  }
}
