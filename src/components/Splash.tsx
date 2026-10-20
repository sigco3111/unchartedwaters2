import { Dropbox, DropboxAuth } from "dropbox";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { GameConfig } from "./Game";

import logo from "../assets/logo.gif";
import { IconDropbox } from "./icon/IconDropbox";
import { IconGithub } from "./icon/IconGithub";
import { Guide } from "./Guide";

const DBX_CLIENT_ID = "95lb7zut06xyhr8";

/**
 * name: 모드 이름
 * version: 모드 버전
 * mod: 모드 압축 파일 이름, 확장자 제외, `zip -vrj` 명령어로 생성하세요.
 * entry: 실행 파일 이름 (기본값 `KOEI.COM`)
 * saveFile: 세이브 파일 이름 (기본값 `KOUKAI2.DAT`)
 */
const modSettings: {
  name: string;
  version: string;
  help?: string;
  config?: GameConfig;
  parts?: { name: string; config: GameConfig }[];
}[] = [
  {
    name: "버그/번역 교정판",
    version: "v1.08",
    config: {
      mod: "mod_correction_v1.08",
      gameFile: "mod_correction_v1.08.zip",
      saveFile: undefined,
    },
  },
  {
    name: "정화편 (기본판)",
    version: "v3.0",
    config: {
      mod: "mod_junghwa_v3.0",
      gameFile: "mod_junghwa_v3.0.zip",
      saveFile: "CHENGHO.DAT",
    },
  },
  {
    name: "에르네스트 모드",
    version: "v1.11",
    config: {
      mod: "mod_ernst_v1.11",
      gameFile: "mod_ernst_v1.11.zip",
      entry: "PLAY.BAT",
    },
  },
  {
    name: "밀란다 / 살바도르편",
    version: "v161126",
    help: "밀란다 / 살바도르편은 세이브파일이 호환됩니다.",
    parts: [
      {
        name: "- 패치1: 밀란다",
        config: {
          mod: "mod_eojeon_161126",
          gameFile: "mod_eojeon_161126_p1.zip",
        },
      },
      {
        name: "- 패치2: 밀란다",
        config: {
          mod: "mod_eojeon_161126",
          gameFile: "mod_eojeon_161126_p2.zip",
        },
      },
      {
        name: "- 패치3: 살바도르편",
        config: {
          mod: "mod_eojeon_161126",
          gameFile: "mod_eojeon_161126_p3.zip",
        },
      },
    ],
  },
];

interface SplashProps {
  dbx: Dropbox | undefined;
  onChangeDbx: (dbx: Dropbox | undefined) => void;
  onStartGame: (gameConfig: GameConfig) => void;
}

export function Splash({ dbx, onChangeDbx, onStartGame }: SplashProps) {
  const [isLoadingDbx, setIsLoadingDbx] = useState<boolean>(true);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  const dropboxLogin = useCallback(() => {
    location.href = new DropboxAuth({
      clientId: DBX_CLIENT_ID,
    }).getAuthenticationUrl(location.href.replace(/\/+$/, ""));
  }, []);

  const dropboxLogout = useCallback(() => {
    window.localStorage.removeItem("dbx_access_token");
    onChangeDbx(undefined);
  }, [onChangeDbx]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.hash.slice(1));
    const dbxAccessToken =
      searchParams.get("access_token") ||
      window.localStorage.getItem("dbx_access_token") ||
      null;

    if (location.hash) {
      history.replaceState({}, "", location.href.replace(location.hash, ""));
    }

    if (dbxAccessToken) {
      const dbx = new Dropbox({ accessToken: dbxAccessToken });
      dbx
        .usersGetCurrentAccount()
        .then(() => {
          window.localStorage.setItem("dbx_access_token", dbxAccessToken);
          onChangeDbx(dbx);
        })
        .catch(() => {
          dropboxLogout();
        })
        .finally(() => {
          setIsLoadingDbx(false);
        });
    } else {
      setIsLoadingDbx(false);
    }
  }, [dropboxLogout, onChangeDbx]);

  const gameMenuComponents = useMemo(() => {
    return (
      <>
        <button
          type="button"
          class="menu__item"
          onClick={() => onStartGame({})}
        >
          <span>대항해시대2 실행</span>
        </button>
        {modSettings.map(({ name, version, config, help, parts }, modIndex) =>
          config ? (
            <button
              key={modIndex}
              type="button"
              class="menu__item"
              onClick={() => onStartGame(config)}
            >
              <span>{name} 실행</span>
              <span class="italic">{version}</span>
            </button>
          ) : parts ? (
            <div key={modIndex}>
              <div class="menu__title">
                <span>{name}</span>
                <span class="italic">{version}</span>
              </div>
              {help ? <div class="menu__help">{help}</div> : null}
              {parts.map(({ name, config }, partIndex) => (
                <button
                  key={partIndex}
                  type="button"
                  class="menu__item__item"
                  onClick={() => onStartGame(config)}
                >
                  <span>{name} 실행</span>
                </button>
              ))}
            </div>
          ) : null,
        )}
      </>
    );
  }, [onStartGame]);

  return (
    <div class="splash">
      <img src={logo} class="px-4" />
      <div class="menu">
        <div class="corner corner-tl" />
        <div class="corner corner-tr" />
        <div class="corner corner-bl" />
        <div class="corner corner-br" />
        {gameMenuComponents}
      </div>
      <div class="menu">
        {isLoadingDbx ? (
          <div class="menu__item">
            <div class="menu__item__icon size-4">
              <IconDropbox />
            </div>
            <span class="w-[80px]">&nbsp;</span>
          </div>
        ) : dbx ? (
          <button type="button" class="menu__item" onClick={dropboxLogout}>
            <div class="menu__item__icon size-4 fill-blue-500">
              <IconDropbox />
            </div>
            <span>드롭박스 로그아웃</span>
          </button>
        ) : (
          <button type="button" class="menu__item" onClick={dropboxLogin}>
            <div class="menu__item__icon size-4">
              <IconDropbox />
            </div>
            <span>드롭박스 로그인</span>
          </button>
        )}
        <button type="button" class="menu__item" onClick={() => setShowGuide(true)}>
          <div class="menu__item__icon size-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <span>게임 가이드</span>
        </button>
        <a
          type="button"
          class="menu__item"
          href="https://github.com/sigco3111/unchartedwaters2"
          target="_blank"
          rel="noreferrer"
        >
          <div class="menu__item__icon size-4">
            <IconGithub />
          </div>
          <span>소스코드 / 버그 리포트</span>
        </a>
      </div>
      {showGuide ? <Guide onClose={() => setShowGuide(false)} /> : null}
    </div>
  );
}
