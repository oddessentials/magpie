local OUT = os.getenv("MAGPIE_EVENTS_FILE") or "magpie-events.jsonl"
local MAX_DEPTH = 3

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
        table.sort(keys, function(a, b)
            return tostring(a) < tostring(b)
        end)
        local parts = {}
        for _, key in ipairs(keys) do
            parts[#parts + 1] = '"' .. escape(tostring(key)) .. '":' .. encode(value[key])
        end
        return "{" .. table.concat(parts, ",") .. "}"
    elseif kind == "string" then
        return '"' .. escape(value) .. '"'
    elseif kind == "number" then
        if value == math.floor(value) and math.abs(value) < 2 ^ 53 then
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

local function try(fn, ...)
    local ok, value = pcall(fn, ...)
    if ok then
        return value
    end
    return nil
end

local function valid(object)
    return object ~= nil and type(object) == "userdata" and object.IsValid ~= nil and object:IsValid()
end

local function full_name(value)
    return try(function()
        return value:GetFullName()
    end)
end

local function to_string(value)
    local result = try(function()
        return value:ToString()
    end)
    if result == "" or result == "None" then
        return nil
    end
    return result
end

local function struct_of(value)
    local name = full_name(value)
    if type(name) ~= "string" or name:sub(1, 13) ~= "ScriptStruct " then
        return nil, name
    end
    local path = name:sub(14)
    local struct = try(StaticFindObject, path)
    if valid(struct) then
        return struct, path
    end
    return nil, name
end

local function guid_text(value)
    return try(function()
        local parts = {}
        for _, field in ipairs({ "A", "B", "C", "D" }) do
            parts[#parts + 1] = string.format("%08X", math.tointeger(value[field]) & 0xFFFFFFFF)
        end
        local id = table.concat(parts)
        if id == "00000000000000000000000000000000" then
            return nil
        end
        return id
    end)
end

local decode

local function decode_field(value, property, depth)
    local class = try(function()
        return property:GetClass():GetFName():ToString()
    end) or ""
    if class == "StrProperty" or class == "NameProperty" or class == "TextProperty" then
        if type(value) == "string" then
            return value
        end
        return to_string(value)
    elseif class:find("Int") or class:find("Float") or class:find("Double") or class == "ByteProperty" then
        if type(value) == "number" then
            return value
        end
        return try(function()
            return math.tointeger(value)
        end) or try(function()
            return tonumber(value)
        end)
    elseif class == "BoolProperty" then
        if type(value) == "boolean" then
            return value
        end
        return try(function()
            return value == true
        end)
    elseif class == "StructProperty" then
        return decode(value, depth + 1)
    elseif class == "ObjectProperty" or class == "ClassProperty" then
        return full_name(value)
    elseif class == "ArrayProperty" or class == "SetProperty" or class == "MapProperty" then
        local count = try(function()
            return #value
        end)
        return count and ("[" .. count .. "]") or class
    end
    return class
end

decode = function(value, depth)
    depth = depth or 0
    local kind = type(value)
    if kind ~= "userdata" then
        return value
    end
    if depth > MAX_DEPTH then
        return "..."
    end
    local struct, path = struct_of(value)
    if not struct then
        local shown = to_string(value)
        if shown then
            return shown
        end
        return path or kind
    end
    if path == "/Script/CoreUObject.Guid" then
        return guid_text(value)
    end
    if path == "/Script/GameplayTags.GameplayTag" then
        return to_string(try(function()
            return value.TagName
        end))
    end
    local out = {}
    local count = 0
    try(function()
        struct:ForEachProperty(function(property)
            local name = try(function()
                return property:GetFName():ToString()
            end)
            if name and count < 24 then
                count = count + 1
                local field = try(function()
                    return value[name]
                end)
                local decoded = decode_field(field, property, depth)
                if decoded ~= nil then
                    out[name] = decoded
                end
            end
        end)
    end)
    if count == 0 then
        return path
    end
    return out
end

local param_names = {}

local function names_for(path)
    if param_names[path] then
        return param_names[path]
    end
    local names = {}
    local fn = try(StaticFindObject, path)
    if valid(fn) then
        try(function()
            fn:ForEachProperty(function(property)
                local name = try(function()
                    return property:GetFName():ToString()
                end)
                if name then
                    names[#names + 1] = name
                end
            end)
        end)
    end
    param_names[path] = names
    return names
end

local function params(path, ...)
    local names = names_for(path)
    local out = {}
    for index = 1, select("#", ...) do
        local raw = (select(index, ...))
        local value = try(function()
            return raw:get()
        end)
        if value == nil then
            value = raw
        end
        out[names[index] or ("p" .. index)] = decode(value, 0)
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
    local out = {
        player_name = try(function()
            return state:GetPlayerName()
        end),
        session_id = try(function()
            return math.tointeger(state.PlayerId)
        end),
    }
    local owner = try(function()
        return state.OwnerGuid
    end)
    if owner ~= nil then
        out.owner = decode(owner, 1)
    end
    local platform = try(function()
        return state.PlatformData
    end)
    if platform ~= nil then
        out.platform = decode(platform, 1)
    end
    return out
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

local function hook(path, kind, describe_self, on_event)
    local ok, err = pcall(RegisterHook, path, function(context, ...)
        local done, failure = pcall(function(...)
            local self = try(function()
                return context:get()
            end)
            local fields = merge({ hook = path }, params(path, ...))
            if describe_self ~= false then
                merge(fields, describe(self))
            end
            fields.self = full_name(self)
            emit(kind, fields)
            if on_event then
                on_event(fields)
            end
        end, ...)
        if not done and not warned[path] then
            warned[path] = true
            print("[MagpieEvents] " .. path .. " handler failed: " .. tostring(failure) .. "\n")
        end
    end)
    print("[MagpieEvents] " .. path .. (ok and " hooked" or (" unavailable: " .. tostring(err))) .. "\n")
end

hook("/Script/JagexChatBackend.PlayerChatComponent:Server_SendChatMessage", "chat")
hook("/Script/JagexChatBackend.PlayerChatComponent:Server_SendPlayerEvent", "player_event")
hook("/Script/Dominion.DominionPlayerCharacter:Client_SendDeathEventTelemetry", "death")
hook("/Script/Dominion.PlayerRespawnComponent:Multicast_Respawn", "respawn")
hook("/Script/Engine.PlayerController:ClientWasKicked", "kicked")
hook("/Script/Dominion.DominionPlayerController:Server_RequestAdminAction", "admin_action")
hook("/Script/Dominion.DominionPlayerController:Server_GetAdminInfo", "admin_info")
hook("/Script/Dominion.DominionPlayerControllerBase:Client_WorldOwnershipGranted", "ownership")
hook("/Script/Dominion.DominionPlayerCharacter:NetMulticast_OnPlayerSkillLevelIncreased", "skill_level")
hook("/Script/Dominion.SkillComponent:AddXpFromEvent", "xp")
hook("/Script/Dominion.SkillComponent:BP_OnSkillXPChanged", "xp_changed")
hook("/Script/Dominion.DominionPlayerController:Client_ShowJournalItemPopup", "journal")
hook("/Script/Dominion.QuestProgressComponent:Client_OnQuestUpdated", "quest")
hook("/Script/Dominion.QuestProgressComponent:CompleteQuest", "quest_complete")
hook("/Script/Dominion.BuildModeComponent:Server_SpawnBuilding", "build")
hook("/Script/Dominion.BuildModeComponent:Client_TelemetryOnBuildingPieceComplete", "build_complete")
hook("/Script/Dominion.InventoryController:Server_CraftRecipe", "craft")
hook("/Script/Dominion.InventoryController:Client_OnCraftingResultHandler", "craft_result")
hook("/Script/Dominion.BaseTeleportationComponent:Server_TryTeleport", "teleport")
hook("/Script/Dominion.DominionPlayerController:Client_SetIsInBaseRaid", "base_raid")
hook("/Script/Dominion.DominionPlayerController:Client_SetIsInDragonEvent", "dragon_event")
hook("/Script/Dominion.DominionPlayerController:Client_SetIsBeingHunted", "hunted")
hook("/Script/Dominion.BossAltar:Multicast_OnBossSummon", "boss_summon")
hook("/Script/Dominion.BossAltar:Multicast_OnBossSpawn", "boss_spawn")
hook("/Script/Dominion.DominionPlayerController:Client_SetServerConnectionComplete", "connected")
hook("/Script/Dominion.DominionPlayerControllerBase:Client_DisconnectWithReason", "disconnect")
hook("/Script/Dominion.DominionPlayerController:Server_DisconnectMe", "leaving")
hook("/Script/Dominion.DisplayNameComponent:Server_RegisterCharacter", "character_registered")
hook("/Script/Dominion.DominionPlayerControllerBase:Server_SetPlayerCharacterInfo", "character_info")
hook("/Script/Dominion.DominionPlayerController:Server_GrantPrivileges", "privileges_granted")
hook("/Script/Dominion.DominionPlayerController:Server_RevokePrivileges", "privileges_revoked")
hook("/Script/Dominion.PlayerHealthComponent:Multicast_Revive", "revive")
hook("/Script/Dominion.RevealedMapIconsComponent:Server_RevealLandmark", "landmark")
hook("/Script/Dominion.ProgressComponent:Client_OnItemFirstPickup", "first_pickup")
hook("/Script/Dominion.ProgressComponent:Client_OnActorFirstInteractedWith", "first_interaction")
hook("/Script/Dominion.ProgressComponent:Client_UpdateAgilityCourseHighScore", "agility_time")
hook("/Script/Dominion.AgilityCourseManager:Client_ValidatedTime", "agility_validated")
hook("/Script/Dominion.FarmCommandComponent:Server_TryHarvestPlot", "farm_harvest")
hook("/Script/Dominion.FarmCommandComponent:Server_TryPlantSeed", "farm_plant")
hook("/Script/Dominion.MapCustomizationComponent:Server_NotifyPinPlaced", "map_pin")
hook("/Script/Dominion.MapCustomizationComponent:Server_NotifyWaypointPlaced", "waypoint")
hook("/Script/Dominion.PlayerConversationComponent:Server_StartConversation", "conversation")
hook("/Script/Dominion.JournalComponent:Server_MarkJournalEntryRead", "journal_read")
hook("/Script/Dominion.DominionPlayerController:Server_SetSignProperties", "sign")
hook("/Script/Dominion.DominionPlayerController:Server_SetObjectCustomName", "named_object")
hook("/Script/Dominion.NotificationsRouter:Client_DispatchFixedTextNotification", "notice")
hook("/Script/Dominion.DominionPlayerController:Client_DisplayTextNotification", "notice_text")
hook("/Script/Dominion.DominionPlayerController:Client_DisplayFixedTextNotification", "notice_fixed")
hook("/Script/Dominion.DominionPlayerController:Client_DisplayRestingNotification", "resting")
hook("/Script/Dominion.WorldSettingsBeaconClient:Server_EditWorld", "world_edited")

local STOP = os.getenv("MAGPIE_STOP_FILE")
local stopping = false
local last_save = nil

hook("/Script/Dominion.PersistenceSubsystem:PostSaveWorldState", "save_done", false, function(fields)
    last_save = fields
end)

local function quit()
    local helpers = require("UEHelpers")
    local world = try(helpers.GetWorld)
    local library = try(helpers.GetKismetSystemLibrary)
    if not (valid(world) and valid(library)) then
        emit("quit_failed", { reason = "no world" })
        return
    end
    emit("quit", {})
    local ok, err = pcall(function()
        library:ExecuteConsoleCommand(world, "quit", nil)
    end)
    if not ok then
        emit("quit_failed", { reason = tostring(err) })
    end
end

local function save_and_quit()
    local subsystem = try(FindFirstOf, "PersistenceSubsystem")
    if not valid(subsystem) then
        emit("save_failed", { reason = "no persistence subsystem" })
        quit()
        return
    end
    local slot = try(function()
        return subsystem.WorldSaveSettings.WorldSlotName
    end)
    if type(slot) ~= "string" then
        slot = to_string(slot)
    end
    last_save = nil
    emit("save_requested", { slot = slot })
    local ok, err = pcall(function()
        subsystem:SaveGame(true)
    end)
    if not ok then
        emit("save_failed", { reason = tostring(err) })
    end
    local waited = 0
    LoopAsync(1000, function()
        waited = waited + 1
        if last_save == nil and waited < 30 then
            return false
        end
        ExecuteInGameThread(quit)
        return true
    end)
end

if STOP then
    LoopAsync(2000, function()
        if stopping then
            return true
        end
        local file = io.open(STOP, "r")
        if not file then
            return false
        end
        file:close()
        stopping = true
        emit("stop_requested", { file = STOP })
        ExecuteInGameThread(save_and_quit)
        return true
    end)
end

emit("mod_loaded", { file = OUT, stop = STOP })
