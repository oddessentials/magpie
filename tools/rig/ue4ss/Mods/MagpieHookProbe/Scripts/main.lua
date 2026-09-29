assert(os.getenv("MAGPIE_VALIDATION_WORLD") == "isolated-copy", "validation requires an isolated copy of the world")
local OUT = assert(os.getenv("MAGPIE_PROBE_FILE"))
local function write(line)
    local file = assert(io.open(OUT, "a"))
    file:write(line, "\n")
    file:close()
end
local function wrapped(value) return { get = function() return value end } end
local function properties(object)
    local fields = {}
    object:ForEachProperty(function(property)
        local name = property:GetFName():ToString()
        local kind = property:GetClass():GetFName():ToString()
        local extra = ""
        if kind == "StructProperty" then extra = property:GetStruct():GetFullName() end
        fields[#fields + 1] = name .. ":" .. kind .. ":" .. extra
    end)
    return table.concat(fields, "\t")
end
ExecuteWithDelay(45000, function()
    local ok, failure = pcall(function()
        local callbacks = {}
        local environment = setmetatable({ RegisterHook = function(path, callback) callbacks[path] = callback end, print = function(line) if line:find("handler failed") then write(line) end end }, { __index = _G })
        environment.os = setmetatable({ getenv = function(key)
            if key == "MAGPIE_EVENTS_FILE" then return OUT .. ".callbacks.jsonl" end
            if key == "MAGPIE_STOP_FILE" then return nil end
            return os.getenv(key)
        end }, { __index = os })
        assert(loadfile(assert(os.getenv("MAGPIE_TEST_SCRIPT")), "t", environment))()
        local outer = FindFirstOf("PersistenceSubsystem")
        assert(outer:IsValid())
        local holder = StaticConstructObject(StaticFindObject("/Script/Dominion.NotificationQuestData"), outer)
        assert(holder:IsValid())
        holder:GetClass():ForEachProperty(function(property)
            if property:GetFName():ToString() == "QuestProgressData" then
                property:ImportText('(State=EQuestState::Complete,CurrentObjective="MagpieFixtureStep")', property:ContainerPtrToValuePtr(holder, 0), 0, holder)
            end
        end)
        local data = StaticConstructObject(StaticFindObject("/Script/Dominion.QuestData"), outer)
        assert(data:IsValid())
        holder.QuestProgressData.Data = data
        local row = holder.QuestProgressData
        assert(row.State == 2 and row.CurrentObjective:ToString() == "MagpieFixtureStep")
        write("QUEST_USERDATA " .. type(row) .. " " .. row:GetFullName())
        callbacks["/Script/Dominion.QuestProgressComponent:Client_OnQuestUpdated"](wrapped(outer), wrapped(row), wrapped(row), wrapped(false), wrapped(false))
        local skill = StaticConstructObject(StaticFindObject("/Script/Dominion.SkillData"), outer)
        local recipe = StaticConstructObject(StaticFindObject("/Script/Dominion.RecipeData"), outer)
        assert(skill:IsValid() and recipe:IsValid())
        callbacks["/Script/Dominion.SkillComponent:BP_OnSkillXPChanged"](wrapped(outer), wrapped(skill), wrapped(250), wrapped(175))
        callbacks["/Script/Dominion.BuildModeComponent:Client_TelemetryOnBuildingPieceComplete"](wrapped(outer), wrapped(true), wrapped(42))
        callbacks["/Script/Dominion.InventoryController:Client_OnCraftingResultHandler"](wrapped(outer), wrapped(0), wrapped(recipe), wrapped(3))
        write("CALLBACKS_PASS")
        ForEachUObject(function(object)
            local name = object:GetFullName()
            if name:match("^Function /Script/.") or name:match("^ScriptStruct /Script/.") then
                write(name .. "\t" .. properties(object))
            elseif name:match("^Enum /Script/.") then
                local entries = {}
                object:ForEachName(function(key, value) entries[#entries + 1] = key:ToString() .. "=" .. value end)
                write(name .. "\t" .. table.concat(entries, "\t"))
            end
        end)
        write("SCHEMA_PASS")

    end)
    if not ok then write("CALLBACKS_ERROR " .. tostring(failure)) end
    local stop = assert(io.open(assert(os.getenv("MAGPIE_STOP_FILE")), "w"))
    stop:write("stop\n")
    stop:close()
end)
