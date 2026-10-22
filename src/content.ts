export const PLAYER_COLORS = ['#79bba7', '#ad95ce', '#df9c9e', '#d9b35e'] as const;
export const ACCESSORIES = ['curl', 'bow', 'cap', 'crown', 'bunny'] as const;
export type Accessory = typeof ACCESSORIES[number];
export const ACCESSORY_LABELS: Record<Accessory, string> = { curl: 'くるりん', bow: 'リボン', cap: 'ぼうし', crown: 'おうかん', bunny: 'うさみみ' };
export interface BabyStyle { name: string; color: string; accessory: Accessory }
export const DEFAULT_STYLES: BabyStyle[] = ['もちもち', 'ぷくぷく', 'にこにこ', 'ころころ'].map((name, i) => ({ name, color: PLAYER_COLORS[i], accessory: ACCESSORIES[i] }));
export type CourseId = 'nursery' | 'toybox' | 'cloud';
export type ZoneKind = 'toy' | 'ball' | 'cushion' | 'echo' | 'sprint';
export interface CourseZone { kind: ZoneKind; zStart: number; zEnd: number; x: number; width: number }
export const ZONE_LABELS: Record<ZoneKind, string> = { toy: 'おもちゃの誘惑', ball: 'ボールころころ', cushion: 'ふわふわクッション', echo: 'シャカシャカひびく！', sprint: 'ラストスパート' };
export interface CourseDefinition { id: CourseId; name: string; description: string; palette: number[]; background: number; zones: CourseZone[]; duckSpots: {x: number; z: number}[] }
export const COURSES: CourseDefinition[] = [
  { id: 'nursery', name: 'はじめてのプレイマット', description: '広いマットで、のんびり初レース。', palette: [0xbee0d5, 0xd8d0e8, 0xf6e2af, 0xf0cccb, 0xc8e0e7, 0xefe6cd], background: 0xf9f5e9,
    duckSpots: [{x: -4.2, z: 6}, {x: 4.2, z: -3}, {x: -3.9, z: -11.5}],
    zones: [{kind:'toy', zStart:8, zEnd:4, x:-3.7, width:3}, {kind:'ball', zStart:2, zEnd:-1, x:0, width:11}, {kind:'cushion', zStart:-4, zEnd:-7, x:3, width:4}, {kind:'echo', zStart:-9, zEnd:-13, x:0, width:11}, {kind:'sprint', zStart:-15, zEnd:-20, x:0, width:11}] },
  { id: 'toybox', name: 'おもちゃパレード', description: '転がるボールと誘惑がいっぱい！', palette: [0xf2c1ba,0xf8dca1,0xbadbdc,0xc4c5e7,0xf0d7a7,0xc0d5c5], background: 0xf7eee7,
    duckSpots: [{x: 4.4, z: 8}, {x: -4.4, z: 1}, {x: 4.2, z:-10}],
    zones: [{kind:'toy', zStart:11, zEnd:6, x:3.4, width:3.8}, {kind:'echo', zStart:5, zEnd:2, x:-2, width:6}, {kind:'ball', zStart:1, zEnd:-4, x:0, width:11}, {kind:'toy', zStart:-5, zEnd:-9, x:-3.5, width:3.8}, {kind:'cushion', zStart:-10, zEnd:-13, x:0, width:5}, {kind:'sprint', zStart:-15, zEnd:-20, x:0, width:11}] },
  { id: 'cloud', name: 'くもいろクッション', description: 'ふわふわをよけて、音の道を進もう。', palette: [0xd3d5ec,0xc5deed,0xf1e2f0,0xd0e8df,0xf5e8c4,0xdde5ef], background: 0xeff1f8,
    duckSpots: [{x:-4.3,z:6}, {x:4.3,z:-4}, {x:-4.2,z:-12}],
    zones: [{kind:'cushion',zStart:10,zEnd:5,x:-2.8,width:5}, {kind:'echo',zStart:10,zEnd:5,x:3,width:4}, {kind:'ball',zStart:3,zEnd:0,x:0,width:11}, {kind:'cushion',zStart:-2,zEnd:-7,x:2.8,width:5}, {kind:'toy',zStart:-8,zEnd:-11,x:-3.5,width:3.5}, {kind:'echo',zStart:-11,zEnd:-14,x:0,width:11}, {kind:'sprint',zStart:-15,zEnd:-20,x:0,width:11}] },
];
export const getCourse = (id: CourseId) => COURSES.find(c => c.id === id) ?? COURSES[0];
export type EventId = 'N01'|'N02'|'N03'|'N04'|'N05'|'N06'|'N07'|'N08'|'R01'|'R02'|'R03'|'R04'|'R05'|'R06'|'R07'|'R08'|'R09'|'R10'|'S01'|'S02'|'S03'|'S04'|'S05'|'S06'|'S07'|'S08'|'S09';
export interface EventDefinition { id: EventId; name: string; description: string; rarity: 'normal'|'rare'|'legendary'; icon: string }
const rows: [EventId,string,string,string][] = [
 ['N01','アヒルさん発見！','アヒルに寄り道。近くで呼び戻そう。','♧'], ['N02','キョロキョロ','ガラガラを見失って、ひとやすみ。','?'], ['N03','おしりペタン','突然ぺたん。いいリズムで呼んでみよう。','◡'], ['N04','こっち見て！','お隣のベビーが気になる！','♡'], ['N05','ガラガラ飽きた','鳴らしすぎ！少し間をあけよう。','…'], ['N06','ハイハイ迷子','あれ？進む方向はそっち？','↶'], ['N07','おててパチパチ','レース中でも拍手は大事。','✧'], ['N08','くしゃみ！','はっくしゅん！体がぴょこん。','!'],
 ['R01','おしりジェット','すわったまま、すいーっと加速！','➜'], ['R02','ほふくの達人','姿勢を低くしてプロ級の前進。','»'], ['R03','赤ちゃん渋滞','お隣を追いかけ、みんなの進路が混線！','♧'], ['R04','テンション爆発','キャッキャッ！ごきげん爆走。','☆'], ['R05','つられ笑い','近くのベビーにも笑顔が伝染。','☺'], ['R06','ハイハイ大回転','くるくる回って、どっちが前？','↻'], ['R07','ミルクの誘惑','哺乳瓶のおもちゃに一直線。','♙'], ['R08','急なライバル意識','負けられない！急にやる気。','⚑'],
 ['R09','うんち！おむつ交換タイム','レースの途中でも交換優先！すっきりしたら再出発。','♨'], ['R10','おしゃぶり落下！ギャン泣きリレー','おしゃぶりがぽろり。近くのベビーまで泣きだしちゃう！近くで鳴らしてなだめよう。','☂'],
 ['S01','たっち覚醒！','決めポーズから突然の二足ダッシュ！','✦'], ['S02','ベビーロボ起動','カクカク前進。曲がるのは苦手。','▣'], ['S03','ランウェイ・ベビー','みんな見て！モデル歩きで大歓声。','♛'], ['S04','ベビー忍者','すばやくジグザグ！方向に気をつけて。','✶'], ['S05','逆走の王','そっちじゃないって！短い全力逆走。','↶'], ['S06','分身の術!?','残像いっぱい。本体をガラガラで誘導！','≋'], ['S07','覚醒おしりドリフト','すわって華麗に横すべり。','⌁'], ['S08','ゴール目前のドヤ顔','ゴールの前で、はい決め顔。','✧'],
 ['S09','ギャル覚醒！ベビパラ☆','突然ギャルメイクでパラパラ！踊ったあとはごきげんダッシュ☆','★'],
];
export const EVENTS: EventDefinition[] = rows.map(([id,name,description,icon])=>({id,name,description,icon,rarity:id[0]==='N'?'normal':id[0]==='R'?'rare':'legendary'}));
export const getEvent = (id: EventId) => EVENTS.find(e=>e.id===id)!;
