export function Guide({ onClose }: { onClose: () => void }) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        class="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-slate-800 p-6 text-left text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-bold">대항해시대2 웹버전 가이드</h2>
          <button
            type="button"
            class="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
            onClick={onClose}
          >
            닫기 ✕
          </button>
        </div>

        <section class="mb-5">
          <h3 class="mb-2 text-base font-bold text-amber-300">게임 시작하기</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>메인 화면에서 원하는 버전을 선택하세요. 원본(대항해시대2 실행), 버그/번역 교정판, 정화편(기본판), 에르네스트 모드, 밀란다/살바도르편이 있습니다.</li>
            <li>처음 실행할 때는 게임 데이터를 내려받느라 로딩이 다소 걸릴 수 있습니다.</li>
            <li>전체화면 버튼(게임 화면 좌측, 가로모드에서는 상단)을 누르면 더 크게 플레이할 수 있습니다.</li>
          </ul>
        </section>

        <section class="mb-5">
          <h3 class="mb-2 text-base font-bold text-amber-300">PC 조작 방법</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>마우스 클릭: 메뉴 선택, 지점 이동</li>
            <li>방향키: 이동 / Enter: 확인 / ESC: 취소·뒤로 가기</li>
            <li>숫자패드 1~9: 대각선을 포함한 8방향 이동</li>
            <li>메뉴 단축키: +(또는 R)=메뉴1, -(또는 E)=메뉴2, *(또는 W)=메뉴3, /(또는 Q)=메뉴4</li>
          </ul>
        </section>

        <section class="mb-5">
          <h3 class="mb-2 text-base font-bold text-amber-300">모바일 조작 방법</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>기본 모드: 화면의 가상 조이스틱으로 이동하고, 가상 키패드로 확인/취소/메뉴를 입력합니다.</li>
            <li>터치 마우스 모드: 커서 모양 버튼을 누르면 화면 터치가 마우스처럼 동작합니다. 탭=클릭, 드래그=커서 이동입니다. 상점 거래처럼 정확한 클릭이 필요한 장면에서 편리합니다. 버튼을 다시 누르면 조이스틱 모드로 돌아갑니다.</li>
            <li>키보드 모양 버튼으로 가상 키패드를 켜고 끌 수 있습니다.</li>
            <li>자동 항해: 종이비행기 모양 버튼을 켠 뒤 조이스틱으로 방향을 잡고 손을 떼면 그 방향으로 계속 항해합니다. 조이스틱을 다시 움직이면 방향이 바뀌고, 버튼을 다시 누르면 멈춥니다. 육지 충돌·폭풍·전투는 스스로 피하지 못하니 화면을 주기적으로 확인하세요.</li>
            <li>매크로 녹화/재생: 메뉴(≡)에서 '매크로 녹화'를 누르고 반복할 조작을 한 번 직접 수행한 뒤 중지하면, '매크로 재생'으로 그대로 반복 실행할 수 있습니다. 무역 왕복처럼 순서가 정해진 반복 작업에 유용합니다. 화면 상태를 감지하지 못하므로 재생 중에는 화면을 지켜보세요.</li>
          </ul>
        </section>

        <section class="mb-5">
          <h3 class="mb-2 text-base font-bold text-amber-300">세이브 / 불러오기</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>게임 안에서 세이브하면 브라우저에 자동으로 저장되고 화면에 안내가 표시됩니다. 같은 브라우저에서는 다시 실행해도 이어서 할 수 있습니다.</li>
            <li>좌측 메뉴(≡)에서 세이브 파일 다운로드(백업·다른 기기로 옮기기), 세이브 파일 가져오기, 게임 초기화를 할 수 있습니다.</li>
            <li>드롭박스에 로그인하면 세이브를 드롭박스에 백업하고 다시 가져올 수도 있습니다.</li>
            <li>주의: 모드(버전)마다 세이브 파일이 다릅니다. 밀란다/살바도르편 패치끼리만 호환됩니다. 브라우저 데이터를 지우면 세이브도 삭제되니, 중요한 진행은 파일 다운로드나 드롭박스로 백업해 두세요.</li>
          </ul>
        </section>

        <section class="mb-5">
          <h3 class="mb-2 text-base font-bold text-amber-300">화면이 멈추거나 이상할 때</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>새로고침하면 대부분 해결됩니다. 세이브는 브라우저에 그대로 남아 있습니다.</li>
            <li>사이트 업데이트 직후에는 강력 새로고침(PC: Ctrl+Shift+R, 모바일: 브라우저 완전 종료 후 다시 실행)을 해주세요.</li>
          </ul>
        </section>

        <section>
          <h3 class="mb-2 text-base font-bold text-amber-300">저작권 안내</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm leading-6">
            <li>이 사이트는 비상업적 팬 프로젝트입니다. 게임 데이터와 원작에 대한 권리는 KOEI 등 원권리자에게 있으며, 권리자의 요청이 있으면 관련 콘텐츠는 삭제됩니다.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
