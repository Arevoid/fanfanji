import {readJson,writeJson} from "../../../core/storage/storageAdapter";
const KEY="phone_memory_selected_characters_v1";
export function readMemoryCharacterSelection(identityId:string){const read=readJson<Record<string,string>>(KEY,{});return read.valid&&read.value&&typeof read.value[identityId]==="string"?read.value[identityId]:"";}
export function rememberMemoryCharacterSelection(identityId:string,characterId:string){const read=readJson<Record<string,string>>(KEY,{});return read.valid&&read.value&&typeof read.value==="object"&&!Array.isArray(read.value)?writeJson(KEY,{...read.value,[identityId]:characterId}):{success:false};}
