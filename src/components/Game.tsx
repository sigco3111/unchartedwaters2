import { Dropbox } from "dropbox";
import fileDialog from "file-dialog";
import { saveAs } from "file-saver";
import nipple from "nipplejs";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { createDos } from "../dos/create-dos";
import {
  EventHandler,
  blockAddEventListener,
  createKeyboardEvent,
  getBlockedHandler,
  restoreAddEventListener,
} from "../event";
import {
  IdbFileSystem,
  createIdbFileSystem,
} from "../fs/create-idb-file-system";
import { detectFileChange } from "../fs/detect-file-change";
import { Guide } from "./Guide.tsx";
import { VirtualKeyboard } from "./VirtualKeyboard.tsx";

const JOYSTICK_MAPS = [
  105, // ArrowRightUp
  104, // ArrowUp
  103, // ArrowLeftUp
  100, // ArrowLeft
  97, // ArrowLeftDown
  98, // ArrowDown
  99, // ArrowRightDown
  102, // ArrowRight
];

const KEY_ALIAS: Record<string, number> = {
  KeyR: 107, // +
  KeyE: 109, // -
  KeyW: 106, // *
  KeyQ: 111, // /

  // Tenkeyless diagonal (UIO/JKL/M,. → Numpad 789/456/123)
  KeyU: 103, // Numpad7 (LeftUp)
  KeyI: 104, // Numpad8 (Up)
  KeyO: 105, // Numpad9 (RightUp)
  KeyJ: 100, // Numpad4 (Left)
  KeyK: 101, // Numpad5 (Center)
  KeyL: 102, // Numpad6 (Right)
  KeyM: 97, // Numpad1 (LeftDown)
  Comma: 98, // Numpad2 (Down)
  Period: 99, // Numpad3 (RightDown)

  // Special
  ArrowLeftDown: 97,
  ArrowRightDown: 99,
  ArrowLeftUp: 103,
  ArrowRightUp: 105,

  Enter: 13, // NumpadEnter
  ArrowLeft: 100, // Numpad4
  ArrowUp: 104, // Numpad8
  ArrowRight: 102, // Numpad6
  ArrowDown: 98, // Numpad2
};

export interface GameConfig {
  gameFile?: string; // water2.zip
  mod?: string; // water2
  entry?: string;
  saveFile?: string;
}

export interface GameProps {
  config: GameConfig;
  dbx?: Dropbox;
}

export function Game({
  config: {
    gameFile = "water2.zip",
    mod = "water2",
    entry = "KOEI.COM",
    saveFile = "KOUKAI2.DAT",
  },
  dbx,
}: GameProps) {
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(480);

  const [joystickCode, setJoystickCode] = useState<number | null>(null);
  const joystickCodeBefore = useRef<number | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const restoredPendingReload = useRef(false);

  const [enabledToggleFns, setEnabledToggleFns] = useState(false);
  const [touchMode, setTouchMode] = useState<"joystick" | "mouse">("joystick");
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const macroKey = `uw2macro:${saveFile}`;
  const [macroRecording, setMacroRecording] = useState<boolean>(false);
  const [macroPlaying, setMacroPlaying] = useState<boolean>(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState<boolean>(false);
  const [hasMacro, setHasMacro] = useState<boolean>(
    () => !!window.localStorage.getItem(macroKey),
  );
  const macroRecordingRef = useRef<boolean>(false);
  const macroEvents = useRef<
    (
      | { t: number; kind: "keydown" | "keyup"; code: number }
      | { t: number; kind: "click"; x: number; y: number }
    )[]
  >([]);
  const macroStart = useRef<number>(0);
  const macroDownPos = useRef<{ x: number; y: number; t: number } | null>(null);
  const playbackTimers = useRef<number[]>([]);
  const pressedDuringPlayback = useRef<Set<number>>(new Set());
  const [enabledToggleFullscreen, setEnabledToggleFullscreen] = useState(false);
  const [enabledToggleKeyboard, setEnabledToggleKeyboard] = useState(true);

  const screen = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mobileController = useRef<HTMLDivElement>(null);

  const isClearExit = useRef(false);
  const keydownHandlers = useRef<EventHandler[]>([]);
  const keyupHandlers = useRef<EventHandler[]>([]);

  const [toastMessage, setToastMessage] = useState<string | undefined>();
  const [innerToastMessage, setInnerToastMessage] = useState<
    string | undefined
  >();

  useEffect(() => {
    if (toastMessage) {
      setInnerToastMessage(toastMessage);
      const timeout = setTimeout(() => {
        setToastMessage(undefined);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [toastMessage]);

  const database = useRef<IdbFileSystem>();

  const handleResize = useCallback(() => {
    const { width: screenWidth, height: screenHeight } =
      screen.current!.getBoundingClientRect();
    if (screenWidth / 640 > screenHeight / 480) {
      setWidth(~~((screenHeight * 640) / 480));
      setHeight(screenHeight);
    } else {
      setWidth(screenWidth);
      setHeight(~~((screenWidth * 480) / 640));
    }
  }, []);

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (isClearExit.current) {
      return;
    }
    e.preventDefault();
    return (e.returnValue =
      "페이지를 벗어나면 저장하지 않은 내용이 날아갈 수 있습니다.");
  }, []);

  const handleFullScreenChange = useCallback(() => {
    setEnabledToggleFullscreen(!!window.document.fullscreenElement);
  }, []);

  const handleKeyDown = useCallback((code: number) => {
    if (macroRecordingRef.current && macroEvents.current.length < 5000) {
      macroEvents.current.push({
        t: performance.now() - macroStart.current,
        kind: "keydown",
        code,
      });
    }
    const event = createKeyboardEvent("keydown", code);
    keydownHandlers.current.forEach((handler) => handler(event));
  }, []);

  const handleKeyUp = useCallback((code: number) => {
    if (macroRecordingRef.current && macroEvents.current.length < 5000) {
      macroEvents.current.push({
        t: performance.now() - macroStart.current,
        kind: "keyup",
        code,
      });
    }
    const event = createKeyboardEvent("keyup", code);
    keyupHandlers.current.forEach((handler) => handler(event));
  }, []);

  const handleDocumentKeyDown = useCallback(
    (e: KeyboardEvent) => {
      handleKeyDown(KEY_ALIAS[e.code] ?? e.keyCode);
    },
    [handleKeyDown],
  );

  const handleDocumentKeyUp = useCallback(
    (e: KeyboardEvent) => {
      handleKeyUp(KEY_ALIAS[e.code] ?? e.keyCode);
    },
    [handleKeyUp],
  );

  useEffect(() => {
    if (joystickCode === joystickCodeBefore.current) {
      return;
    }
    if (joystickCode) {
      if (joystickCodeBefore.current) {
        handleKeyUp(joystickCodeBefore.current);
      }
      handleKeyDown(joystickCode);
      joystickCodeBefore.current = joystickCode;
    } else if (joystickCodeBefore.current) {
      handleKeyUp(joystickCodeBefore.current);
      joystickCodeBefore.current = null;
    }
  }, [joystickCode, joystickCodeBefore, handleKeyDown, handleKeyUp]);

  const enqueueSavePersist = useCallback(
    (task: (db: IdbFileSystem) => Promise<void>) => {
      saveQueue.current = saveQueue.current
        .then(async () => {
          const db = database.current;
          if (db) {
            await task(db);
          }
        })
        .catch((e) => console.error("save persist failed", e));
    },
    [],
  );

  const start = useCallback(async () => {
    blockAddEventListener(document, ["keydown", "keyup", "keypress"]);
    const db = (database.current = await createIdbFileSystem(mod, 1));
    const { fs, main } = await createDos(canvas.current!);
    await fs.extract(`${import.meta.env.BASE_URL}static/game/${gameFile}`);
    const saveFileBody = await db.load(saveFile);
    if (saveFileBody) {
      // Overwrite Save File
      (fs as any).fs.writeFile(saveFile, saveFileBody); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    await main(["-c", entry]);
    keydownHandlers.current = getBlockedHandler(document, "keydown");
    keyupHandlers.current = getBlockedHandler(document, "keyup");
    restoreAddEventListener(document);

    document.addEventListener("keydown", handleDocumentKeyDown);
    document.addEventListener("keyup", handleDocumentKeyUp);

    detectFileChange(fs, saveFile, () => {
      const nextSave = (fs as any).fs.readFile(saveFile); // eslint-disable-line @typescript-eslint/no-explicit-any
      enqueueSavePersist(async (persistDb) => {
        if (restoredPendingReload.current) {
          setToastMessage(
            "복원 대기 중입니다. 새로고침 후 이전 세이브가 적용되며, 그 전까지의 진행은 저장되지 않습니다.",
          );
          return;
        }
        const prev = await persistDb.load(saveFile);
        if (
          prev &&
          prev.length === nextSave.length &&
          prev.every((b, i) => b === nextSave[i])
        ) {
          return;
        }
        await persistDb.save(saveFile, nextSave);
        if (prev) {
          await persistDb.save(`${saveFile}.backup`, prev);
        }
        setToastMessage("세이브 파일이 브라우저에 저장되었습니다.");
      });
      isClearExit.current = true;
      setTimeout(() => {
        isClearExit.current = false;
      }, 5000);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    handleResize();

    document.addEventListener("fullscreenchange", handleFullScreenChange);

    window.addEventListener("resize", handleResize);
    window.addEventListener("beforeunload", handleBeforeUnload);

    start();

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.removeEventListener("keyup", handleDocumentKeyUp);
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("resize", handleResize);
    };
  }, [
    handleResize,
    handleBeforeUnload,
    handleFullScreenChange,
    handleDocumentKeyDown,
    handleDocumentKeyUp,
    start,
  ]);

  const toggleFns = useCallback(() => {
    setEnabledToggleFns(!enabledToggleFns);
  }, [enabledToggleFns]);

  const toggleFullscreen = useCallback(() => {
    const doc = window.document;
    if (!doc.fullscreenElement) {
      doc.documentElement.requestFullscreen();
      if ((navigator as any).keyboard) {
        (navigator as any).keyboard.lock(["Escape"]);
      }
    } else {
      doc.exitFullscreen();
    }
  }, []);

  const resetGame = useCallback(async () => {
    if (!database.current) {
      return;
    }
    if (
      !confirm(
        "게임을 초기화 하면 진행중인 게임이 삭제될 수 있습니다.\n계속 진행하시겠습니까?",
      )
    ) {
      return;
    }
    enqueueSavePersist(async (persistDb) => {
      const current = await persistDb.load(saveFile);
      if (current) {
        const prevBackup = await persistDb.load(`${saveFile}.backup`);
        const sameAsBackup =
          prevBackup &&
          prevBackup.length === current.length &&
          prevBackup.every((b, i) => b === current[i]);
        if (!sameAsBackup) {
          await persistDb.save(`${saveFile}.backup`, current);
        }
      }
      await persistDb.delete(saveFile);
      restoredPendingReload.current = false;
      setToastMessage(
        "세이브 파일이 삭제되었습니다(이전 진행은 백업에 보관).\n새로고침 후 새로운 게임을 시작할 수 있습니다.",
      );
    });
  }, [saveFile, enqueueSavePersist]);

  const downloadSaveFile = useCallback(async () => {
    if (!database.current) {
      return;
    }
    const data = await database.current.load(saveFile);
    if (!data) {
      setToastMessage("🚫 세이브 파일을 찾을 수 없습니다.");
      return;
    }

    const url = URL.createObjectURL(
      new Blob([data], {
        type: "application/octet-stream",
      }),
    );
    saveAs(url, saveFile);
  }, [saveFile]);

  const uploadSaveFile = useCallback(async () => {
    if (!database.current) {
      return;
    }
    if (
      !confirm(
        "세이브 파일을 불러오면 현재 브라우저에서 진행중인 게임이 삭제 될 수 있습니다.\n계속 진행하시겠습니까?",
      )
    ) {
      return;
    }
    const files = await fileDialog();
    if (!files[0]) {
      return;
    }
    database.current.save(
      saveFile,
      new Uint8Array(await files[0].arrayBuffer()),
    );
    setToastMessage(
      "세이브 파일이 브라우저에 저장되었습니다.\n새로고침 후 파일을 불러 올 수 있습니다.",
    );
  }, [saveFile]);

  const stopMacroPlayback = useCallback(
    (silent = false) => {
      playbackTimers.current.forEach((t) => window.clearTimeout(t));
      playbackTimers.current = [];
      pressedDuringPlayback.current.forEach((code) => handleKeyUp(code));
      pressedDuringPlayback.current.clear();
      setMacroPlaying(false);
      if (!silent) {
        setToastMessage("매크로 재생을 중지했습니다.");
      }
    },
    [handleKeyUp],
  );

  const toggleMacroRecording = useCallback(() => {
    if (macroPlaying) {
      setToastMessage("🚫 매크로 재생 중에는 녹화할 수 없습니다.");
      return;
    }
    if (macroRecording) {
      macroRecordingRef.current = false;
      setMacroRecording(false);
      const events = macroEvents.current;
      if (events.length > 0) {
        window.localStorage.setItem(macroKey, JSON.stringify(events));
        setHasMacro(true);
        setToastMessage(
          `매크로 녹화 완료: ${events.length}개 동작이 저장되었습니다.`,
        );
      } else {
        setToastMessage("녹화된 동작이 없어 저장하지 않았습니다.");
      }
    } else {
      macroEvents.current = [];
      macroDownPos.current = null;
      macroStart.current = performance.now();
      macroRecordingRef.current = true;
      setMacroRecording(true);
      setToastMessage(
        "매크로 녹화를 시작합니다. 키보드·조이스틱 입력과 화면 클릭이 기록됩니다. 끝나면 다시 눌러 중지하세요.",
      );
    }
  }, [macroRecording, macroPlaying, macroKey]);

  const playMacro = useCallback(() => {
    if (macroRecording) {
      setToastMessage("🚫 녹화 중에는 재생할 수 없습니다.");
      return;
    }
    if (macroPlaying) {
      return;
    }
    const raw = window.localStorage.getItem(macroKey);
    if (!raw) {
      setToastMessage("🚫 저장된 매크로가 없습니다.");
      return;
    }
    let events: typeof macroEvents.current;
    try {
      events = JSON.parse(raw);
    } catch {
      setToastMessage("🚫 저장된 매크로를 읽을 수 없습니다.");
      return;
    }
    if (!events.length) {
      setToastMessage("🚫 저장된 매크로가 비어 있습니다.");
      return;
    }
    setShowRepeatPicker(true);
  }, [macroRecording, macroPlaying, macroKey]);

  const startMacroPlayback = useCallback((loops: number) => {
    setShowRepeatPicker(false);
    const raw = window.localStorage.getItem(macroKey);
    if (!raw) {
      setToastMessage("🚫 저장된 매크로가 없습니다.");
      return;
    }
    let events: typeof macroEvents.current;
    try {
      events = JSON.parse(raw);
    } catch {
      setToastMessage("🚫 저장된 매크로를 읽을 수 없습니다.");
      return;
    }
    if (!events.length) {
      setToastMessage("🚫 저장된 매크로가 비어 있습니다.");
      return;
    }
    const cv = canvas.current;
    if (!cv) {
      return;
    }
    setMacroPlaying(true);
    setToastMessage(
      `매크로 재생 시작 (${loops}회 반복). 화면 상태는 감지하지 못하니 이상이 보이면 ≡ 메뉴의 매크로 중지를 누르세요.`,
    );
    const total = events[events.length - 1].t + 500;
    let remaining = loops;
    const runOnce = () => {
      for (const ev of events) {
        const id = window.setTimeout(() => {
          const cvs = canvas.current;
          if (!cvs) {
            return;
          }
          if (ev.kind === "keydown") {
            handleKeyDown(ev.code);
            pressedDuringPlayback.current.add(ev.code);
          } else if (ev.kind === "keyup") {
            handleKeyUp(ev.code);
            pressedDuringPlayback.current.delete(ev.code);
          } else {
            const { x: clickX, y: clickY } = ev as { x: number; y: number };
            const opts = (buttons: number): MouseEventInit => ({
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons,
              clientX: clickX,
              clientY: clickY,
            });
            cvs.dispatchEvent(new MouseEvent("mousemove", opts(1)));
            cvs.dispatchEvent(new MouseEvent("mousedown", opts(1)));
            cvs.dispatchEvent(new MouseEvent("mouseup", opts(0)));
          }
        }, ev.t);
        playbackTimers.current.push(id);
      }
      remaining -= 1;
      if (remaining > 0) {
        playbackTimers.current.push(window.setTimeout(runOnce, total));
      } else {
        playbackTimers.current.push(
          window.setTimeout(() => {
            pressedDuringPlayback.current.forEach((code) => handleKeyUp(code));
            pressedDuringPlayback.current.clear();
            setMacroPlaying(false);
            setToastMessage("매크로 재생이 끝났습니다.");
          }, total),
        );
      }
    };
    runOnce();
  }, [macroKey, handleKeyDown, handleKeyUp]);

  const deleteMacro = useCallback(() => {
    if (!window.confirm("저장된 매크로를 삭제하시겠습니까?")) {
      return;
    }
    window.localStorage.removeItem(macroKey);
    setHasMacro(false);
    setToastMessage("저장된 매크로를 삭제했습니다.");
  }, [macroKey]);

  const restoreSaveBackup = useCallback(async () => {
    if (!database.current) {
      return;
    }
    const backup = await database.current.load(`${saveFile}.backup`);
    if (!backup) {
      setToastMessage("🚫 되돌릴 이전 세이브가 없습니다.");
      return;
    }
    if (
      !confirm(
        "이전 세이브로 되돌리면 현재 진행은 백업으로 보관되고, 이전 세이브가 복원됩니다.\n계속 진행하시겠습니까?",
      )
    ) {
      return;
    }
    enqueueSavePersist(async (persistDb) => {
      const latestBackup = await persistDb.load(`${saveFile}.backup`);
      if (!latestBackup) {
        setToastMessage("🚫 되돌릴 이전 세이브가 없습니다.");
        return;
      }
      const current = await persistDb.load(saveFile);
      await persistDb.save(saveFile, latestBackup);
      if (current) {
        await persistDb.save(`${saveFile}.backup`, current);
      }
      restoredPendingReload.current = true;
      setToastMessage("이전 세이브가 복원되었습니다.\n새로고침 후 적용됩니다.");
    });
  }, [saveFile, enqueueSavePersist]);

  const captureScreenshot = useCallback(() => {
    const cv = canvas.current;
    if (!cv) {
      return;
    }
    cv.toBlob((blob) => {
      if (!blob) {
        setToastMessage("🚫 화면을 캡처할 수 없습니다.");
        return;
      }
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      saveAs(blob, `unchartedwaters2-${stamp}.png`);
      setToastMessage("현재 화면이 이미지 파일로 저장되었습니다.");
    }, "image/png");
  }, []);

  const syncSaveFileToDropbox = useCallback(async () => {
    if (!dbx) {
      setToastMessage("🚫 드롭박스 로그인이 필요합니다.");
      return;
    }
    if (!database.current) {
      return;
    }
    const data = await database.current.load(saveFile);
    if (!data) {
      return;
    }
    try {
      await dbx.filesGetMetadata({
        path: `/${mod}/${saveFile}`,
      });
      if (
        !confirm(
          "세이브 파일을 드롭박스에 저정합니다.\n드롭박스에 저장된 세이브파일이 삭제될 수도 있습니다.\n계속 진행하시겠습니까?",
        )
      ) {
        return;
      }
    } catch (e) {
      // safe
    }
    try {
      await dbx.filesUpload({
        path: `/${mod}/${saveFile}`,
        contents: data,
        mode: { ".tag": "overwrite" },
      });
      setToastMessage("세이브 파일이 드롭박스에 저장되었습니다.");
    } catch (e) {
      setToastMessage("🚫 세이브파일을 드롭박스에 저장하는데 실패했습니다.");
      console.log(e);
    }
  }, [dbx, mod, saveFile]);

  const syncSaveFileFromDropbox = useCallback(async () => {
    if (!dbx) {
      setToastMessage("🚫 드롭박스 로그인이 필요합니다.");
      return;
    }
    if (!database.current) {
      return;
    }
    try {
      const response = await dbx.filesDownload({
        path: `/${mod}/${saveFile}`,
      });
      if (
        !confirm(
          "세이브 파일을 드롭박스에서 불러옵니다.\n현재 브라우저에서 진행중인 게임이 삭제 될 수 있습니다.\n계속 진행하시겠습니까?",
        )
      ) {
        return;
      }
      const fileBlob = (response.result as any).fileBlob as Blob; // eslint-disable-line @typescript-eslint/no-explicit-any
      database.current.save(
        saveFile,
        new Uint8Array(await fileBlob.arrayBuffer()),
      );
      setToastMessage(
        "세이브 파일을 드롭박스에서 성공적으로 불러왔습니다.\n새로고침 후 파일을 불러 올 수 있습니다.",
      );
    } catch (e) {
      setToastMessage("🚫 세이브파일을 드롭박스에서 불러오는데 실패했습니다.");
      console.log(e);
    }
  }, [dbx, mod, saveFile]);

  const toggleKeyboard = useCallback(() => {
    setEnabledToggleKeyboard(!enabledToggleKeyboard);
  }, [enabledToggleKeyboard]);

  const toggleTouchMode = useCallback(() => {
    setJoystickCode(null);
    if (joystickCodeBefore.current) {
      handleKeyUp(joystickCodeBefore.current);
      joystickCodeBefore.current = null;
    }
    const next = touchMode === "joystick" ? "mouse" : "joystick";
    setTouchMode(next);
    setToastMessage(
      next === "mouse"
        ? "터치 마우스 모드: 화면을 터치하면 마우스처럼 동작합니다. (탭=클릭, 드래그=커서 이동)"
        : "조이스틱 모드: 화면을 드래그하면 가상 조이스틱이 나타납니다.",
    );
  }, [touchMode, handleKeyUp]);

  // Macro recording: capture clicks on the DOS canvas
  useEffect(() => {
    const cv = canvas.current;
    if (!macroRecording || !cv) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      macroDownPos.current = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now() - macroStart.current,
      };
    };
    const onUp = (e: MouseEvent) => {
      const d = macroDownPos.current;
      macroDownPos.current = null;
      if (!d || macroEvents.current.length >= 5000) {
        return;
      }
      if (Math.abs(e.clientX - d.x) <= 10 && Math.abs(e.clientY - d.y) <= 10) {
        macroEvents.current.push({ t: d.t, kind: "click", x: d.x, y: d.y });
      }
    };
    cv.addEventListener("mousedown", onDown, true);
    cv.addEventListener("mouseup", onUp, true);
    return () => {
      cv.removeEventListener("mousedown", onDown, true);
      cv.removeEventListener("mouseup", onUp, true);
    };
  }, [macroRecording]);

  // Joystick mode: virtual joystick on the screen zone
  useEffect(() => {
    if (touchMode !== "joystick" || !mobileController.current) {
      return;
    }
    const joystick = nipple.create({
      zone: mobileController.current,
    });
    joystick.on("move", (_, data) => {
      if (data.force > 0.3) {
        setJoystickCode(
          JOYSTICK_MAPS[(Math.floor((data.angle.degree - 22.5) / 45) + 8) % 8],
        );
      } else {
        setJoystickCode(null);
      }
    });
    joystick.on("end", () => {
      setJoystickCode(null);
    });
    return () => {
      joystick.destroy();
    };
  }, [touchMode]);

  // Mouse mode: touch acts like a mouse on the DOS canvas
  // (finger = cursor, tap = left click)
  useEffect(() => {
    const zone = mobileController.current;
    const cv = canvas.current;
    if (touchMode !== "mouse" || !zone || !cv) {
      return;
    }

    let activeTouchId: number | null = null;
    let pendingRelease: number | undefined;
    let pressedTouch: Touch | null = null;
    let startX = 0;
    let startY = 0;
    let dragged = false;

    const dispatchMouse = (type: string, touch: Touch) => {
      cv.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: type === "mousedown" ? 1 : 0,
          clientX: touch.clientX,
          clientY: touch.clientY,
        }),
      );
    };

    const showTapIndicator = (x: number, y: number) => {
      const dot = document.createElement("div");
      dot.className = "touch-tap-indicator";
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      document.body.appendChild(dot);
      window.setTimeout(() => dot.remove(), 450);
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // A second finger cancels the gesture rather than selecting an item.
      if (activeTouchId !== null || e.touches.length !== 1) {
        activeTouchId = null;
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) {
        return;
      }
      activeTouchId = touch.identifier;
      dragged = false;
      startX = touch.clientX;
      startY = touch.clientY;
      dispatchMouse("mousemove", touch);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTouchId === null) {
        return;
      }
      const touch = Array.from(e.changedTouches).find(
        (item) => item.identifier === activeTouchId,
      );
      if (!touch) {
        return;
      }
      if (
        Math.abs(touch.clientX - startX) > 10 ||
        Math.abs(touch.clientY - startY) > 10
      ) {
        dragged = true;
      }
      dispatchMouse("mousemove", touch);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTouchId === null) {
        return;
      }
      const touch = Array.from(e.changedTouches).find(
        (item) => item.identifier === activeTouchId,
      );
      if (!touch) {
        return;
      }
      activeTouchId = null;
      if (!dragged && Math.abs(touch.clientX - startX) <= 10 &&
          Math.abs(touch.clientY - startY) <= 10) {
        dispatchMouse("mousemove", touch);
        // DOS polls button state per frame; a same-tick down/up can be missed.
        if (pressedTouch) {
          window.clearTimeout(pendingRelease);
          dispatchMouse("mouseup", pressedTouch);
        }
        dispatchMouse("mousedown", touch);
        pressedTouch = touch;
        pendingRelease = window.setTimeout(() => {
          dispatchMouse("mouseup", touch);
          pressedTouch = null;
        }, 100);
        showTapIndicator(touch.clientX, touch.clientY);
      }
    };

    const onTouchCancel = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      activeTouchId = null;
    };

    zone.addEventListener("touchstart", onTouchStart, { passive: false });
    zone.addEventListener("touchmove", onTouchMove, { passive: false });
    zone.addEventListener("touchend", onTouchEnd, { passive: false });
    zone.addEventListener("touchcancel", onTouchCancel, { passive: false });
    return () => {
      window.clearTimeout(pendingRelease);
      if (pressedTouch) {
        dispatchMouse("mouseup", pressedTouch);
      }
      zone.removeEventListener("touchstart", onTouchStart);
      zone.removeEventListener("touchmove", onTouchMove);
      zone.removeEventListener("touchend", onTouchEnd);
      zone.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [touchMode]);

  const ignoreStopAndPrevent = useCallback((e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return (
    <div class="game">
      <div class="game__header" onMouseDown={(e) => e.preventDefault()}>
        <div class="game__header__nav">
          <div class="flex grow flex-row landscape:flex-col">
            <button
              type="button"
              class="game__header__item"
              title="토글 메뉴"
              onClick={toggleFns}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
          </div>
          <div class="flex flex-row landscape:flex-col">
            <button
              type="button"
              class="game__header__item"
              title="전체화면"
              onClick={toggleFullscreen}
            >
              {enabledToggleFullscreen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
              )}
            </button>
            <button
              type="button"
              class={`game__header__item ${enabledToggleKeyboard ? "" : "game__header__item--disabled"}`}
              onClick={toggleKeyboard}
            >
              <svg version="1.1" viewBox="0 0 128 128">
                <path d="M125.5,28.1c-1.667,-1.667 -3.679,-2.501 -6.034,-2.501l-110.933,0c-2.355,0 -4.366,0.834 -6.033,2.501c-1.666,1.667 -2.5,3.678 -2.5,6.033l0,59.733c0,2.356 0.834,4.366 2.5,6.033c1.667,1.667 3.678,2.502 6.033,2.502l110.933,0c2.355,0 4.367,-0.835 6.034,-2.502c1.666,-1.667 2.5,-3.677 2.5,-6.033l0,-59.733c0,-2.355 -0.834,-4.366 -2.5,-6.033Zm-6.034,65.766l-110.933,0l0,-59.733l110.933,0l0,59.733Z" />
                <path d="M18.133,85.332l6.4,0c0.711,0 1.067,-0.356 1.067,-1.067l0,-6.399c0,-0.71 -0.355,-1.067 -1.067,-1.067l-6.4,0c-0.711,0 -1.067,0.357 -1.067,1.067l0,6.399c0,0.711 0.356,1.067 1.067,1.067Z" />
                <path d="M18.133,68.267l14.933,0c0.711,0 1.068,-0.357 1.068,-1.068l0,-6.4c0,-0.711 -0.357,-1.066 -1.068,-1.066l-14.933,0c-0.711,0 -1.067,0.355 -1.067,1.066l0,6.4c0,0.711 0.356,1.068 1.067,1.068Z" />
                <path d="M18.133,51.199l6.4,0c0.711,0 1.067,-0.356 1.067,-1.067l0,-6.399c0,-0.711 -0.355,-1.066 -1.067,-1.067l-6.4,0c-0.711,0 -1.067,0.356 -1.067,1.067l0,6.399c0,0.711 0.356,1.067 1.067,1.067Z" />
                <path d="M92.801,76.799l-57.6,0c-0.712,0 -1.067,0.357 -1.067,1.068l0,6.399c0,0.709 0.355,1.067 1.067,1.067l57.597,0c0.712,0 1.068,-0.356 1.068,-1.067l0,-6.399c0,-0.711 -0.356,-1.068 -1.065,-1.068Z" />
                <path d="M42.667,67.199c0,0.711 0.355,1.068 1.066,1.068l6.4,0c0.711,0 1.066,-0.357 1.066,-1.068l0,-6.4c0,-0.711 -0.354,-1.066 -1.066,-1.066l-6.4,0c-0.711,0 -1.066,0.355 -1.066,1.066l0,6.4Z" />
                <path d="M35.201,51.199l6.399,0c0.711,0 1.067,-0.356 1.067,-1.067l0,-6.399c0,-0.711 -0.356,-1.066 -1.067,-1.067l-6.399,0c-0.712,0 -1.067,0.356 -1.067,1.067l0,6.399c0,0.711 0.356,1.067 1.067,1.067Z" />
                <path d="M59.733,67.199c0,0.711 0.356,1.068 1.066,1.068l6.4,0c0.711,0 1.068,-0.357 1.068,-1.068l0,-6.4c0,-0.711 -0.357,-1.066 -1.068,-1.066l-6.4,0c-0.71,0 -1.066,0.355 -1.066,1.066l0,6.4Z" />
                <path d="M52.266,51.199l6.4,0c0.711,0 1.067,-0.356 1.067,-1.067l0,-6.399c0,-0.711 -0.355,-1.066 -1.067,-1.067l-6.4,0c-0.711,0 -1.067,0.356 -1.067,1.067l0,6.399c0,0.711 0.356,1.067 1.067,1.067Z" />
                <path d="M76.8,67.199c0,0.711 0.356,1.068 1.065,1.068l6.401,0c0.711,0 1.066,-0.357 1.066,-1.068l0,-6.4c0,-0.711 -0.355,-1.066 -1.066,-1.066l-6.401,0c-0.709,0 -1.065,0.355 -1.065,1.066l0,6.4Z" />
                <path d="M109.866,76.799l-6.399,0c-0.712,0 -1.068,0.357 -1.068,1.068l0,6.399c0,0.709 0.356,1.067 1.068,1.067l6.399,0c0.711,0 1.067,-0.356 1.067,-1.067l0,-6.399c0,-0.711 -0.355,-1.068 -1.067,-1.068Z" />
                <path d="M69.333,51.199l6.401,0c0.711,0 1.066,-0.356 1.066,-1.067l0,-6.399c0,-0.711 -0.355,-1.066 -1.066,-1.067l-6.401,0c-0.711,0 -1.066,0.356 -1.066,1.067l0,6.399c0,0.711 0.355,1.067 1.066,1.067Z" />
                <path d="M86.4,51.199l6.399,0c0.711,0 1.067,-0.356 1.067,-1.067l0,-6.399c0,-0.711 -0.356,-1.066 -1.067,-1.067l-6.399,0c-0.711,0 -1.068,0.356 -1.068,1.067l0,6.399c0,0.711 0.357,1.067 1.068,1.067Z" />
                <path d="M93.866,67.199c0,0.711 0.355,1.068 1.066,1.068l14.933,0c0.712,0 1.068,-0.357 1.068,-1.068l0,-23.466c0,-0.711 -0.355,-1.066 -1.068,-1.067l-6.399,0c-0.711,0 -1.067,0.356 -1.067,1.067l0,16l-7.467,0c-0.711,0 -1.066,0.355 -1.066,1.066l0,6.4l0,0Z" />
              </svg>
            </button>
            <button
              type="button"
              class={`game__header__item ${touchMode === "mouse" ? "" : "game__header__item--disabled"}`}
              title="터치 마우스 모드 (화면 터치를 마우스처럼 사용)"
              onClick={toggleTouchMode}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 8.757l-1.59-1.59M6 10.5H3.75m4.007 4.243-1.591 1.59"
                />
              </svg>
            </button>
            <button
              type="button"
              class="game__header__item"
              title="게임 가이드"
              onClick={() => setShowGuide(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="game__header__item"
              title="화면 캡처 (현재 화면을 이미지로 저장)"
              onClick={captureScreenshot}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                />
              </svg>
            </button>
          </div>
        </div>

        <div
          class={`game__header__fns ${enabledToggleFns ? "game__header__fns--toggled" : ""}`}
        >
          <button
            type="button"
            class="game__header__fns__item"
            onClick={resetGame}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            <span>게임 초기화</span>
          </button>
          <button
            type="button"
            class="game__header__fns__item"
            onClick={downloadSaveFile}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            <span>세이브 파일 다운로드</span>
          </button>

          <button
            type="button"
            class="game__header__fns__item"
            onClick={uploadSaveFile}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
              />
            </svg>
            <span>세이브 파일 가져오기</span>
          </button>
          <button
            type="button"
            class="game__header__fns__item"
            onClick={restoreSaveBackup}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
              />
            </svg>
            <span>이전 세이브로 되돌리기</span>
          </button>
          <button
            type="button"
            class="game__header__fns__item"
            onClick={toggleMacroRecording}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill={macroRecording ? "#f87171" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6.75 6.75 0 1 0 0-13.5 6.75 6.75 0 0 0 0 13.5Z"
              />
            </svg>
            <span>{macroRecording ? "매크로 녹화 중지" : "매크로 녹화"}</span>
          </button>
          <button
            type="button"
            class="game__header__fns__item"
            onClick={playMacro}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
              />
            </svg>
            <span>{macroPlaying ? "매크로 재생 중…" : "매크로 재생"}</span>
          </button>
          {macroPlaying ? (
            <button
              type="button"
              class="game__header__fns__item"
              onClick={() => stopMacroPlayback()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
                />
              </svg>
              <span>매크로 중지</span>
            </button>
          ) : null}
          {hasMacro && !macroPlaying ? (
            <button
              type="button"
              class="game__header__fns__item"
              onClick={deleteMacro}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
              <span>매크로 삭제</span>
            </button>
          ) : null}
          <button
            type="button"
            class="game__header__fns__item"
            onClick={syncSaveFileToDropbox}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
              />
            </svg>
            <span>드롭박스에 세이브 파일 저장하기</span>
          </button>
          <button
            type="button"
            class="game__header__fns__item"
            onClick={syncSaveFileFromDropbox}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
              />
            </svg>
            <span>드롭박스에서 세이브 파일 가져오기</span>
          </button>
        </div>
      </div>

      <div
        class="game__screen"
        style={{
          "--screen-width": `${width}px`,
          "--screen-height": `${height}px`,
        }}
        ref={screen}
      >
        <div class="game__canvas">
          <canvas ref={canvas} />
        </div>

        <div
          class="game__event-blocker"
          ref={mobileController}
          onTouchStart={ignoreStopAndPrevent}
          onTouchEnd={ignoreStopAndPrevent}
          onTouchMove={ignoreStopAndPrevent}
        />
        {enabledToggleKeyboard && (
          <VirtualKeyboard onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} />
        )}
      </div>

      <div class={`toast ${toastMessage ? "toast--active" : ""}`}>
        {innerToastMessage}
      </div>

      {macroPlaying ? (
        <button
          type="button"
          class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-6 py-3 text-base font-bold text-white shadow-xl"
          onClick={() => stopMacroPlayback()}
        >
          ■ 매크로 중지
        </button>
      ) : null}

      {showRepeatPicker ? (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div class="w-full max-w-xs rounded-lg bg-slate-800 p-5 text-center text-slate-100 shadow-xl">
            <div class="mb-3 text-base font-bold">매크로 반복 횟수</div>
            <div class="mb-4 grid grid-cols-5 gap-2">
              {[1, 3, 5, 10, 30].map((n) => (
                <button
                  key={n}
                  type="button"
                  class="rounded bg-slate-700 px-2 py-2 text-sm hover:bg-slate-600"
                  onClick={() => startMacroPlayback(n)}
                >
                  {n}회
                </button>
              ))}
            </div>
            <button
              type="button"
              class="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
              onClick={() => setShowRepeatPicker(false)}
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {showGuide ? <Guide onClose={() => setShowGuide(false)} /> : null}
    </div>
  );
}
