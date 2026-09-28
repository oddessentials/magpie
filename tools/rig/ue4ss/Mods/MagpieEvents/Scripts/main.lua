local OUT = os.getenv("MAGPIE_EVENTS_FILE") or "magpie-events.jsonl"

local function escape(text)
    return (text:gsub('[%c"\\]', function(c)
        local named = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
        return named[c] or string.format("\\u%04x", c:byte())
    end))
end

local function encode(value)
    local kind = type(value)
    if kind == "table" then
        local keys = {}
        for key in pairs(value) do
            keys[#keys + 1] = key
        end
        table.sort(keys)
        local parts = {}
        for _, key in ipairs(keys) do
            parts[#parts + 1] = '"' .. escape(tostring(key)) .. '":' .. encode(value[key])
        end
        return "{" .. table.concat(parts, ",") .. "}"
    elseif kind == "string" then
        return '"' .. escape(value) .. '"'
    elseif kind == "number" then
        if value == math.floor(value) then
            return string.format("%d", value)
        end
        return string.format("%.3f", value)
    elseif kind == "boolean" then
        return tostring(value)
    end
    return "null"
end

local function emit(kind, fields)
    fields.v = 1
    fields.type = kind
    fields.ts = os.date("!%Y-%m-%dT%H:%M:%SZ")
    local file = io.open(OUT, "a")
    if file then
        file:write(encode(fields), "\n")
        file:close()
    end
    print("[MagpieEvents] " .. encode(fields) .. "\n")
end

local function try(fn)
    local ok, value = pcall(fn)
    if ok then
        return value
    end
    return nil
end

local function valid(object)
    return object ~= nil and type(object) == "userdata" and object.IsValid ~= nil and object:IsValid()
end

local function text(value)
    if value == nil then
        return nil
    end
    if type(value) == "string" or type(value) == "number" or type(value) == "boolean" then
        return value
    end
    local result = try(function()
        return value:ToString()
    end)
    if result == nil or result == "" or result == "None" then
        result = try(function()
            return value:GetFullName()
        end)
    end
    return result
end

local function param(value)
    local got = try(function()
        return value:get()
    end)
    if got == nil then
        got = value
    end
    local shown = text(got)
    if shown == nil then
        return type(got)
    end
    return shown
end

local function params(...)
    local out = {}
    for index = 1, select("#", ...) do
        out["p" .. index] = param((select(index, ...)))
    end
    return out
end

local function player_state_of(object)
    for _ = 1, 5 do
        if not valid(object) then
            return nil
        end
        local state = try(function()
            return object.PlayerState
        end)
        if valid(state) then
            return state
        end
        local owner = try(function()
            return object:GetOwner()
        end)
        if not valid(owner) then
            owner = try(function()
                return object:GetOuter()
            end)
        end
        object = owner
    end
    return nil
end

local function describe(object)
    local state = player_state_of(object)
    if not state then
        return {}
    end
    return {
        player_name = text(try(function()
            return state:GetPlayerName()
        end)),
        player_id = text(try(function()
            return state.UniqueId
        end)),
        account = text(try(function()
            return state.PlayerId
        end)),
    }
end

local function merge(target, source)
    for key, value in pairs(source or {}) do
        if value ~= nil then
            target[key] = value
        end
    end
    return target
end

local warned = {}

local function hook(path, kind, describe_from)
    local ok, err = pcall(RegisterHook, path, function(context, ...)
        local done, failure = pcall(function(...)
            local self = try(function()
                return context:get()
            end)
            local fields = merge({ hook = path }, params(...))
            if describe_from ~= false then
                merge(fields, describe(self))
                fields.self = text(self)
            end
            emit(kind, fields)
        end, ...)
        if not done and not warned[path] then
            warned[path] = true
            print("[MagpieEvents] " .. path .. " handler failed: " .. tostring(failure) .. "\n")
        end
    end)
    print("[MagpieEvents] " .. path .. (ok and " hooked" or (" unavailable: " .. tostring(err))) .. "\n")
end

hook("/Script/Engine.GameModeBase:K2_PostLogin", "login")
hook("/Script/Engine.GameModeBase:K2_OnLogout", "logout")
hook("/Script/JagexChatBackend.PlayerChatComponent:Server_SendChatMessage", "chat")
hook("/Script/JagexChatBackend.PlayerChatComponent:Server_SendPlayerEvent", "chat_event")
hook("/Script/Dominion.DominionPlayerController:Server_RequestAdminAction", "admin_action")
hook("/Script/Dominion.DominionPlayerController:Server_GetAdminInfo", "admin_info")
hook("/Script/Dominion.HealthComponent:OnDeathEvent", "death")
hook("/Script/Dominion.Gravestone:OnGravestoneAdded", "gravestone")
hook("/Script/Dominion.SkillComponent:AddXpFromEvent", "xp")
hook("/Script/Dominion.SkillComponent:BP_OnSkillLevelIncreased", "skill_level")
hook("/Script/Dominion.JournalComponent:UnlockJournalEntry", "journal")
hook("/Script/Dominion.QuestProgressComponent:CompleteQuest", "quest_complete")
hook("/Script/Dominion.QuestProgressComponent:GiveQuest", "quest_given")
hook("/Script/Dominion.BuildModeComponent:Server_SpawnBuilding", "build")
hook("/Script/Dominion.BaseBuildingActor:BP_OnBuildingConstructed", "building_constructed", false)
hook("/Script/Dominion.BaseTeleportationComponent:Server_TryTeleport", "teleport")

emit("mod_loaded", { file = OUT })
