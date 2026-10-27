import type {Character,UserSettings} from "../../types";
import {resolveCanonicalCharacterId} from "./characterIdentity";

export function resolveCharacterApiSettings(global:UserSettings,character:Character|undefined,characters:readonly Character[]=[]):UserSettings {
  if(!character)return global;
  const canonical=characters.find(c=>c.id===resolveCanonicalCharacterId(character.id,characters));
  const config=canonical?.characterApi??character.characterApi;
  if(!config?.enabled)return global;
  const api=config.presetId?global.apiPresets?.find(p=>p.id===config.presetId):config.custom;
  if(!api)throw new Error("角色 API 配置已失效，请重新选择预设或关闭独立 API。");
  if(!api.apiKey?.trim()||!api.selectedModel?.trim())throw new Error("请填写角色 API 密钥和模型，或关闭独立 API 以跟随全局。");
  if(!Number.isFinite(api.apiTemperature)||api.apiTemperature<0||api.apiTemperature>2)throw new Error("角色 API 温度应为 0 到 2 之间的数字。");
  return {...global,apiKey:api.apiKey.trim(),apiEndpoint:(api.apiEndpoint||"").trim(),selectedModel:api.selectedModel.trim(),apiTemperature:api.apiTemperature,streamCompatible:Boolean(api.streamCompatible)};
}
