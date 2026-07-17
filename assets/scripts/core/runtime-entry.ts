import { director, Director } from 'cc';

import { GameBootstrap } from './game-bootstrap';

function installGameBootstrap(): void {
  const scene = director.getScene();
  const canvas = scene?.getChildByName('Canvas');
  if (!canvas || canvas.getComponent(GameBootstrap)) return;
  canvas.addComponent(GameBootstrap);
}

director.on(
  Director.EVENT_AFTER_SCENE_LAUNCH,
  installGameBootstrap,
);

// 스크립트 로드 시점에 이미 씬이 실행된 경우도 처리합니다.
installGameBootstrap();
